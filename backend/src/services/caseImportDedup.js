import crypto from 'crypto';
import { db } from '../db/schema.js';
import { readScript } from './caseWorkspace.js';

function parseJson(raw, fallback = null) {
  if (raw == null || String(raw).trim() === '') return fallback;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

export function scriptFingerprint(script) {
  const normalized = String(script || '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * 检测团队内重复用例（同名或脚本内容一致）
 * @returns {{ id: number, name: string, matchBy: 'name' | 'script' } | null}
 */
export function findDuplicateCase(teamId, name, script) {
  const tid = Number(teamId);
  const trimmedName = String(name || '').trim();
  const fp = scriptFingerprint(script);

  if (trimmedName) {
    const byName = db.prepare(
      "SELECT id, name FROM cases WHERE team_id = ? AND status = 'active' AND name = ? LIMIT 1",
    ).get(tid, trimmedName);
    if (byName) {
      return { id: Number(byName.id), name: byName.name, matchBy: 'name' };
    }
  }

  const rows = db.prepare(
    "SELECT id, name, team_id, script_path, metadata_json FROM cases WHERE team_id = ? AND status = 'active'",
  ).all(tid);

  for (const row of rows) {
    const meta = parseJson(row.metadata_json, {});
    let existingScript = String(meta.script || '').trim();
    if (!existingScript) {
      try {
        existingScript = readScript(row.team_id, row.id) || '';
      } catch {
        existingScript = '';
      }
    }
    if (existingScript && scriptFingerprint(existingScript) === fp) {
      return { id: Number(row.id), name: row.name, matchBy: 'script' };
    }
  }

  return null;
}

export function duplicateErrorMessage(dup) {
  if (!dup) return '用例已存在';
  const reason = dup.matchBy === 'name' ? '同名' : '相同脚本';
  return `用例已存在（${reason}）：${dup.name}`;
}
