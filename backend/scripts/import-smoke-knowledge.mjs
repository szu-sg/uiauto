#!/usr/bin/env node
/**
 * 将 scripts/smoke-split 按「一条用例 = 一个 test」同步到文件夹「知识基座」，并维护测试计划（不自动跑计划）。
 * 服务器: cd backend && node scripts/import-smoke-knowledge.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../src/db/schema.js';
import { importCaseBundle } from '../src/services/caseImport.js';
import { findOrCreateFolderByName } from '../src/services/caseFolderService.js';
import { validatePlanRecord } from '../src/services/planEnvironmentValidation.js';
import { deleteCase } from '../src/services/caseService.js';
import { createOnScriptChange } from '../src/services/caseVersionService.js';
import { ensureSmokeKnowledgeShared, clearAuth } from '../src/services/caseWorkspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPLIT_DIR = path.resolve(__dirname, '../../scripts/smoke-split');
const FOLDER_NAME = '知识基座';
const ENV_NAME_HINT = process.env.SMOKE_ENV_NAME || '王进东';
const PLAN_NAME = process.env.SMOKE_PLAN_NAME || '知识基座冒烟调试';
const DRY_RUN = process.env.DRY_RUN === '1';
const FULL_SMOKE_MARK = '模块J 历史记录';
const INLINE_HELPERS_MARK = 'export const APP_TYPES';
const SHARED_IMPORT_MARK = 'smoke-knowledge-helpers.mjs';
const MAX_CASE_SCRIPT_LINES = 120;

function resolveTeamId() {
  if (process.env.SMOKE_TEAM_ID) return Number(process.env.SMOKE_TEAM_ID);
  const row = db.prepare('SELECT id FROM teams ORDER BY id LIMIT 1').get();
  if (!row) throw new Error('无团队');
  return row.id;
}

function resolveUserId(teamId) {
  const owner = db.prepare(
    `SELECT u.id FROM users u
     INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
     WHERE tm.role = 'owner' LIMIT 1`,
  ).get(teamId);
  if (owner) return owner.id;
  const any = db.prepare(
    'SELECT user_id AS id FROM team_members WHERE team_id = ? LIMIT 1',
  ).get(teamId);
  if (!any) throw new Error('团队无成员');
  return any.id;
}

function findEnvironment(teamId) {
  const rows = db.prepare(
    `SELECT id, name FROM execution_environments WHERE team_id = ? ORDER BY id`,
  ).all(teamId);
  const hit = rows.find((r) => String(r.name).includes(ENV_NAME_HINT))
    || rows.find((r) => String(r.name).includes('灰度'));
  if (!hit) {
    console.log('可用环境:', rows.map((r) => `${r.id}:${r.name}`).join(', ') || '(无)');
    throw new Error(`未找到名称含「${ENV_NAME_HINT}」或「灰度」的执行环境`);
  }
  return hit;
}

function loadSplitItems() {
  const manifestPath = path.join(SPLIT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`缺少 ${manifestPath}，请先运行: node scripts/build-smoke-split.mjs`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const items = [];
  for (const entry of manifest.items || []) {
    const fp = path.join(SPLIT_DIR, entry.filename);
    if (!fs.existsSync(fp)) throw new Error(`缺少 ${fp}`);
    const script = fs.readFileSync(fp, 'utf8');
    const lines = script.split('\n').length;
    if (
      lines > MAX_CASE_SCRIPT_LINES
      || script.includes(FULL_SMOKE_MARK)
      || script.includes(INLINE_HELPERS_MARK)
      || script.includes('const APP_TYPES = {')
      || !script.includes(SHARED_IMPORT_MARK)
    ) {
      throw new Error(`拆分脚本须为单条 test + 共享 helper 引用: ${entry.name} (${lines} 行)`);
    }
    items.push({
      name: entry.name,
      script,
      tags: ['知识基座', '冒烟'],
      portability: 'portable',
      source: 'imported',
      skip_dedup: true,
      allow_duplicate: true,
    });
  }
  return items;
}

function parseMeta(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 用例不存登录态，执行时由测试计划环境注入 wps_sid */
function applyPlanEnvLoginOnly(teamId, caseId) {
  clearAuth(teamId, caseId);
  const row = db.prepare('SELECT metadata_json FROM cases WHERE id = ? AND team_id = ?').get(caseId, teamId);
  if (!row) return;
  const meta = parseMeta(row.metadata_json);
  meta.login_preference = 'plan_env';
  delete meta.hasAuth;
  if (meta.extra && typeof meta.extra === 'object') {
    delete meta.extra.hasAuth;
    delete meta.extra.cookieCount;
  }
  db.prepare(
    `UPDATE cases SET has_auth = 0, default_environment_id = NULL, environment_snapshot_json = NULL,
     metadata_json = ? WHERE id = ? AND team_id = ?`,
  ).run(JSON.stringify(meta), caseId, teamId);
}

/** 按用例名 upsert，并强制把 workspace + metadata 写成拆分后的单条脚本 */
function upsertSplitCase(teamId, userId, folderId, item) {
  const existing = db.prepare(
    "SELECT id, metadata_json FROM cases WHERE team_id = ? AND status = 'active' AND name = ? LIMIT 1",
  ).get(teamId, item.name);

  if (existing) {
    createOnScriptChange(teamId, existing.id, item.script, {
      changeNote: '知识基座拆分脚本同步',
      source: 'import',
      createdBy: String(userId),
    });
    db.prepare(
      `UPDATE cases SET folder_id = ?, source = 'imported', tags_json = ?, portability = 'portable'
       WHERE id = ? AND team_id = ?`,
    ).run(folderId, JSON.stringify(item.tags), existing.id, teamId);
    applyPlanEnvLoginOnly(teamId, existing.id);
    return existing.id;
  }

  const created = importCaseBundle(teamId, userId, {
    ...item,
    folder_id: folderId,
    priority: 'P1',
  });
  applyPlanEnvLoginOnly(teamId, created.id);
  return created.id;
}

function purgeWrongSmokeCases(teamId, folderId) {
  const rows = db.prepare(
    `SELECT id, name, metadata_json FROM cases WHERE team_id = ? AND status = 'active'
     AND (folder_id = ? OR tags_json LIKE '%知识基座%' OR name LIKE 'SMK%')`,
  ).all(teamId, folderId);
  let removed = 0;
  for (const row of rows) {
    const meta = parseMeta(row.metadata_json);
    const script = String(meta.script || '');
    const lines = script.split('\n').length;
    const looksFull =
      lines > MAX_CASE_SCRIPT_LINES
      || script.includes(FULL_SMOKE_MARK)
      || script.includes('const APP_TYPES = {')
      || !script.includes(SHARED_IMPORT_MARK);
    const inManifest = fs.existsSync(path.join(SPLIT_DIR, 'manifest.json'))
      && JSON.parse(fs.readFileSync(path.join(SPLIT_DIR, 'manifest.json'), 'utf8')).items
        .some((i) => i.name === row.name);
    if (looksFull || !inManifest) {
      try {
        deleteCase(teamId, row.id);
        removed += 1;
      } catch (e) {
        console.warn(`删除 #${row.id} ${row.name}:`, e.message);
      }
    }
  }
  return removed;
}

function main() {
  const teamId = resolveTeamId();
  const userId = resolveUserId(teamId);
  const env = findEnvironment(teamId);
  const folderId = findOrCreateFolderByName(teamId, FOLDER_NAME);
  ensureSmokeKnowledgeShared();
  const items = loadSplitItems();

  console.log(`team=${teamId} folder=${folderId}「${FOLDER_NAME}」 env=${env.id}「${env.name}」 split=${items.length}`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1');
    return;
  }

  const purged = purgeWrongSmokeCases(teamId, folderId);
  if (purged) console.log(`已删除未拆分/非清单用例 ${purged} 条`);

  const caseIds = [];
  let failed = 0;
  for (const item of items) {
    try {
      const cid = upsertSplitCase(teamId, userId, folderId, item);
      caseIds.push(cid);
    } catch (e) {
      failed += 1;
      console.error(`失败 ${item.name}:`, e.message);
    }
  }
  console.log(`同步完成: ${caseIds.length} 条, 失败 ${failed}`);
  if (!caseIds.length) throw new Error('无用例写入');

  const existing = db.prepare(
    'SELECT id FROM plans WHERE team_id = ? AND name = ? ORDER BY id DESC LIMIT 1',
  ).get(teamId, PLAN_NAME);

  let planId;
  if (existing) {
    planId = existing.id;
    db.prepare('UPDATE plans SET case_ids_json = ?, environment_id = ? WHERE id = ?').run(
      JSON.stringify(caseIds),
      env.id,
      planId,
    );
    console.log(`已更新计划 #${planId}「${PLAN_NAME}」共 ${caseIds.length} 条`);
  } else {
    const r = db.prepare(
      `INSERT INTO plans (name, repo_owner, repo_name, repo_branch, cases_json, case_ids_json, user_id, team_id, plan_type, environment_id)
       VALUES (?, 'uiauto', 'recorded', 'main', '[]', ?, ?, ?, 'ui_auto', ?)`,
    ).run(PLAN_NAME, JSON.stringify(caseIds), userId, teamId, env.id);
    planId = r.lastInsertRowid;
    console.log(`已创建计划 #${planId}「${PLAN_NAME}」`);
  }

  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  const validation = validatePlanRecord(teamId, plan);
  if (!validation.ready_to_execute) {
    throw new Error(validation.error || '计划未就绪');
  }

  console.log('');
  console.log('请在平台「测试计划 → 知识基座冒烟调试」点击执行（须走计划，不要单独试跑 CLI）。');
  console.log(`计划 ID: ${planId}，环境: ${env.name}`);
}

main();
