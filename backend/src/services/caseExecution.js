import {
  ensureRecordedWorkspace,
  resolveRecordedCasePath,
  resolveRecordedStorageState,
  RECORDED_CASES_ROOT,
} from './recordedCases.js';
import { materializeCaseForRun, getCaseRecord } from './caseService.js';

export function parseCaseMetadataObject(raw) {
  if (raw == null || String(raw).trim() === '') return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return {};
}

/**
 * 解析单条用例的执行来源：平台 cases 工作区。
 */
export function resolveCaseSource(casePath) {
  const p = String(casePath || '').trim().replace(/^\/+/, '');
  const parts = p.split('/');
  const caseId = parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])
    ? Number(parts[1])
    : null;
  return {
    kind: 'platform',
    casePath: p,
    caseId,
    label: 'cases/workspace',
  };
}

export function repoWorkspaceKey() {
  return 'cases:workspace';
}

export function recordedCasesRoot() {
  ensureRecordedWorkspace();
  return RECORDED_CASES_ROOT;
}

/** @deprecated 使用 caseRunner.materializeCaseForRun */
export function syncRecordedCaseForRun(db, casePath, userId, teamId = null) {
  const p = String(casePath || '').trim().replace(/^\/+/, '');
  const row = db.prepare(`
    SELECT id, team_id FROM cases WHERE legacy_path = ? AND status = 'active'
    ${teamId != null ? 'AND team_id = ?' : ''}
    LIMIT 1
  `).get(...(teamId != null ? [p, teamId] : [p]));
  if (row?.id && row.team_id) {
    const { storageState } = materializeCaseForRun(row.team_id, row.id);
    return storageState;
  }
  const parts = p.split('/');
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const { storageState } = materializeCaseForRun(Number(parts[0]), Number(parts[1]));
    return storageState;
  }
  const abs = resolveRecordedCasePath(p);
  if (!abs) throw new Error(`用例「${p}」脚本不存在`);
  return resolveRecordedStorageState(p, null);
}

export function caseMetadataWithSource(item) {
  const source = item.source || item.case_source || item.metadata?.source || 'recorded';
  return {
    name: item.name || '用例',
    description: item.description,
    priority: item.priority,
    source,
    case_id: item.id,
    ...(item.metadata?.reuse_scope ? { reuse_scope: item.metadata.reuse_scope } : {}),
  };
}
