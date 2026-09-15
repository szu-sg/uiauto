import { db } from '../db/schema.js';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';
import { buildCaseMetadata } from '../utils/caseMetadataShape.js';
import { resolveImportSteps } from '../utils/parseImportSteps.js';
import { normalizeScriptText } from '../utils/normalizeScriptText.js';
import { createCase } from './caseService.js';
import { findOrCreateFolderByName } from './caseFolderService.js';
import { duplicateErrorMessage, findDuplicateCase } from './caseImportDedup.js';
import AdmZip from 'adm-zip';

const ENV_KINDS = new Set(['test', 'staging', 'private']);

function createEnvironmentFromImport(teamId, userId, env) {
  const kind = ENV_KINDS.has(String(env.env_kind || '').toLowerCase())
    ? String(env.env_kind).toLowerCase()
    : 'test';
  const headersJson = Array.isArray(env.headers) ? JSON.stringify(env.headers) : '[]';
  const extraJson =
    env.extra_env && typeof env.extra_env === 'object' && !Array.isArray(env.extra_env)
      ? JSON.stringify(env.extra_env)
      : '{}';
  const shRaw =
    env.switchhosts_text != null && String(env.switchhosts_text).trim()
      ? String(env.switchhosts_text)
      : null;
  const r = db.prepare(
    `INSERT INTO execution_environments (
      user_id, team_id, name, env_kind, base_url, headers_json, test_username, test_password,
      extra_env_json, switchhosts_text, wps_company_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    teamId,
    String(env.name || '导入环境').trim(),
    kind,
    env.base_url != null && String(env.base_url).trim() ? String(env.base_url).trim() : null,
    headersJson,
    env.test_username != null && String(env.test_username).trim() ? String(env.test_username).trim() : null,
    env.test_password != null && String(env.test_password) ? String(env.test_password) : null,
    extraJson,
    kind === 'test' ? shRaw : null,
    env.wps_company_name != null && String(env.wps_company_name).trim()
      ? String(env.wps_company_name).trim()
      : null,
  );
  return Number(r.lastInsertRowid);
}

function resolveImportEnvironment(teamId, userId, { environment_id, environment }) {
  if (environment_id != null && environment_id !== '') {
    const id = Number(environment_id);
    const row = db.prepare(
      'SELECT id FROM execution_environments WHERE id = ? AND team_id = ?',
    ).get(id, teamId);
    if (!row) throw new Error('environment_id 不存在或不属于当前团队');
    return { defaultEnvironmentId: id, environmentSnapshotJson: null };
  }

  const env = environment && typeof environment === 'object' ? environment : null;
  if (!env) {
    return { defaultEnvironmentId: null, environmentSnapshotJson: null };
  }

  const mode = String(env.mode || 'snapshot').toLowerCase();
  if (mode === 'create') {
    if (!String(env.name || '').trim()) throw new Error('environment.mode=create 时 name 必填');
    const id = createEnvironmentFromImport(teamId, userId, env);
    return { defaultEnvironmentId: id, environmentSnapshotJson: null };
  }

  const snapshot = {
    mode: 'snapshot',
    name: env.name || null,
    env_kind: env.env_kind || 'test',
    base_url: env.base_url || null,
    headers: Array.isArray(env.headers) ? env.headers : [],
    switchhosts_text: env.switchhosts_text || null,
    test_username: env.test_username || null,
    test_password: env.test_password || null,
    wps_company_name: env.wps_company_name || null,
    extra_env: env.extra_env && typeof env.extra_env === 'object' ? env.extra_env : {},
  };
  return {
    defaultEnvironmentId: null,
    environmentSnapshotJson: JSON.stringify(snapshot),
  };
}

export function validateScript(script) {
  const s = String(script || '').trim();
  if (!s) return 'script 不能为空';
  if (s.length > 500_000) return 'script 过大（上限 500KB）';
  if (!/test\s*\(|test\.|@playwright\/test/i.test(s)) {
    return 'script 需为 Playwright Test 格式（含 test(...)）';
  }
  return null;
}

/** 导入 Case Bundle（脚本 + 可选环境 + 可选 auth） */
export function importCaseBundle(teamId, userId, payload) {
  const name = String(payload?.name || '').trim();
  const script = normalizeScriptText(payload?.script || '');
  const err = validateScript(script);
  if (err) throw new Error(err);
  if (!name) throw new Error('name 必填');

  const storageState = filterEssentialStorageState(
    payload?.auth?.storage_state || payload?.storage_state || null,
  );

  const envRes = resolveImportEnvironment(teamId, userId, {
    environment_id: payload.environment_id,
    environment: payload.environment,
  });

  const hasEnv = !!(envRes.defaultEnvironmentId || envRes.environmentSnapshotJson);
  const portability = payload.portability === 'portable' || !hasEnv ? 'portable' : 'bundle';
  const caseSource = String(payload.source || 'imported').trim() || 'imported';

  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((t) => String(t).trim()).filter(Boolean)
    : Array.isArray(payload.metadata?.tags)
      ? payload.metadata.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

  const moduleName = String(
    payload.module || payload.metadata?.module || '',
  ).trim();
  let folderId = payload.folder_id;
  if (moduleName && (folderId == null || folderId === '')) {
    try {
      folderId = findOrCreateFolderByName(teamId, moduleName);
    } catch {
      /* 无效模块名则忽略 */
    }
  }

  const skipDedup = payload.skip_dedup === true || payload.allow_duplicate === true;
  const duplicate = findDuplicateCase(teamId, name, script);
  if (duplicate && !skipDedup) {
    throw new Error(duplicateErrorMessage(duplicate));
  }

  const steps = resolveImportSteps({
    actionRaw: payload.action,
    script,
    steps: payload.steps || payload.metadata?.steps || [],
  });

  const metadata = buildCaseMetadata({
    source: caseSource,
    script,
    language: payload.language || payload.metadata?.language,
    steps,
    module: moduleName || '其他',
    tags,
    scriptStale: false,
    extra: {
      imported_at: new Date().toISOString(),
      ...(storageState ? { cookieCount: storageState.cookies?.length || 0, hasAuth: true } : {}),
    },
  });
  const created = createCase(teamId, userId, {
    name,
    script,
    description: payload.description != null ? String(payload.description).trim() || null : null,
    priority: payload.priority != null ? String(payload.priority).trim() || null : null,
    source: caseSource,
    portability,
    tags,
    legacy_path: null,
    default_environment_id: envRes.defaultEnvironmentId,
    environment_snapshot_json: envRes.environmentSnapshotJson,
    storageState,
    metadata,
    folder_id: folderId,
  });

  return {
    id: created.id,
    name: created.name,
    path: created.path,
    source: caseSource,
    portability,
    default_environment_id: created.default_environment_id,
    has_auth: !!storageState,
    has_environment: hasEnv,
    summary: {
      scriptSaved: true,
      authSaved: !!storageState,
      environmentLinked: !!envRes.defaultEnvironmentId,
      environmentSnapshot: !!envRes.environmentSnapshotJson,
      cookieCount: storageState?.cookies?.length || 0,
    },
  };
}

/** 解析 ZIP 包（*.spec.ts + 可选 *.auth.json + environment.json）并导入 */
export function importCaseZip(teamId, userId, zipBuffer, {
  name: nameOverride,
  folder_id: folderId,
  priority,
  tags,
  description,
} = {}) {
  if (!zipBuffer || !zipBuffer.length) throw new Error('ZIP 文件为空');

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (!entries.length) throw new Error('ZIP 内无有效文件');

  const specEntry = entries.find((e) => /\.(spec|test)\.(ts|js)$/i.test(e.entryName));
  if (!specEntry) throw new Error('ZIP 内未找到 *.spec.ts / *.test.ts 脚本');

  const authEntry = entries.find((e) => /\.auth\.json$/i.test(e.entryName));
  const envEntry = entries.find((e) => /(^|\/)environment\.json$/i.test(e.entryName));

  const script = specEntry.getData().toString('utf8');
  let storageState = null;
  if (authEntry) {
    try {
      storageState = JSON.parse(authEntry.getData().toString('utf8'));
    } catch {
      throw new Error('case.auth.json 不是合法 JSON');
    }
  }

  let environment = null;
  if (envEntry) {
    try {
      environment = JSON.parse(envEntry.getData().toString('utf8'));
    } catch {
      throw new Error('environment.json 不是合法 JSON');
    }
  }

  const baseName = specEntry.entryName.split('/').pop().replace(/\.(spec|test)\.(ts|js)$/i, '');
  const caseName = String(nameOverride || baseName || '导入用例').trim() || '导入用例';

  const tagList = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const payload = {
    name: caseName,
    script,
    source: 'imported',
    priority: priority != null ? String(priority).trim() || null : null,
    tags: tagList,
    description: description != null ? String(description).trim() || null : null,
  };
  if (storageState) payload.auth = { storage_state: storageState };
  if (folderId != null && folderId !== '') payload.folder_id = folderId;

  return importCaseBundle(teamId, userId, payload);
}

function findZipAuthForSpec(specEntryName, entries) {
  const dir = specEntryName.includes('/')
    ? specEntryName.slice(0, specEntryName.lastIndexOf('/') + 1)
    : '';
  const base = specEntryName.split('/').pop().replace(/\.(spec|test)\.(ts|js)$/i, '');
  const candidates = [
    `${dir}${base}.auth.json`,
    `${dir}case.auth.json`,
    `${dir}${base}.auth.json`.replace(/^\//, ''),
  ];
  for (const name of candidates) {
    const entry = entries.find((e) => e.entryName.replace(/\\/g, '/') === name.replace(/\\/g, '/'));
    if (entry) return entry;
  }
  return entries.find((e) => /\.auth\.json$/i.test(e.entryName));
}

function parseZipEnvironment(entries) {
  const envEntry = entries.find((e) => /(^|\/)environment\.json$/i.test(e.entryName));
  if (!envEntry) return null;
  try {
    return JSON.parse(envEntry.getData().toString('utf8'));
  } catch {
    throw new Error('environment.json 不是合法 JSON');
  }
}

/** 批量导入 Case Bundle */
export function importCaseBatch(teamId, userId, { folder_id: folderId, defaults, items } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw new Error('items 不能为空');

  const results = [];
  let imported = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of list) {
    const itemName = item?.name != null ? String(item.name).trim() : '';
    try {
      if (item.skip) {
        results.push({
          ok: false,
          skipped: true,
          name: itemName || '未知用例',
          duplicate: item.duplicate || null,
          error: item.skip_reason || '已跳过',
        });
        skipped += 1;
        continue;
      }
      let itemFolderId = item.folder_id ?? folderId;
      const moduleName = String(item.module || '').trim();
      if (moduleName && (itemFolderId == null || itemFolderId === '')) {
        try {
          itemFolderId = findOrCreateFolderByName(teamId, moduleName);
        } catch {
          /* ignore */
        }
      }
      const payload = {
        ...item,
        name: itemName || '导入用例',
        source: 'imported',
        folder_id: itemFolderId,
        priority: item.priority ?? defaults?.priority ?? null,
        tags: Array.isArray(item.tags) ? item.tags : (defaults?.tags || []),
        description: item.description ?? defaults?.description ?? null,
        action: item.action ?? defaults?.action ?? null,
      };
      const result = importCaseBundle(teamId, userId, payload);
      results.push({ ok: true, id: result.id, name: result.name });
      imported += 1;
    } catch (e) {
      const msg = e.message || '导入失败';
      const isDup = msg.startsWith('用例已存在');
      if (isDup) {
        results.push({
          ok: false,
          skipped: true,
          duplicate: true,
          name: itemName || item?.filename || '未知用例',
          error: msg,
        });
        skipped += 1;
      } else {
        results.push({
          ok: false,
          name: itemName || item?.filename || '未知用例',
          error: msg,
        });
        failed += 1;
      }
    }
  }

  return { imported, failed, skipped, results };
}

/** 解析 ZIP 内全部 spec 并批量导入 */
export function importMultiSpecZip(teamId, userId, zipBuffer, {
  folder_id: folderId,
  priority,
  tags,
  description,
} = {}) {
  if (!zipBuffer || !zipBuffer.length) throw new Error('ZIP 文件为空');

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (!entries.length) throw new Error('ZIP 内无有效文件');

  const specEntries = entries.filter((e) => /\.(spec|test)\.(ts|js)$/i.test(e.entryName));
  if (!specEntries.length) throw new Error('ZIP 内未找到 *.spec.ts / *.test.ts 脚本');

  const sharedEnvironment = parseZipEnvironment(entries);
  const tagList = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const items = specEntries.map((specEntry) => {
    const script = specEntry.getData().toString('utf8');
    const baseName = specEntry.entryName.split('/').pop().replace(/\.(spec|test)\.(ts|js)$/i, '');
    const authEntry = findZipAuthForSpec(specEntry.entryName, entries);
    let storageState = null;
    if (authEntry) {
      try {
        storageState = JSON.parse(authEntry.getData().toString('utf8'));
      } catch {
        throw new Error(`${authEntry.entryName} 不是合法 JSON`);
      }
    }

    const payload = {
      name: baseName || '导入用例',
      script,
      source: 'imported',
      priority: priority != null ? String(priority).trim() || null : null,
      tags: tagList,
      description: description != null ? String(description).trim() || null : null,
    };
    if (storageState) payload.auth = { storage_state: storageState };
    if (sharedEnvironment) payload.environment = sharedEnvironment;
    return payload;
  });

  return importCaseBatch(teamId, userId, {
    folder_id: folderId,
    items,
  });
}
