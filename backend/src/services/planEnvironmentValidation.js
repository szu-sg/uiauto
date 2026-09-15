import { db } from '../db/schema.js';
import { caseHasOwnEnvironment } from './resolveEnvironment.js';

function parseCaseIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((n) => n > 0);
  }
  try {
    const ids = JSON.parse(String(raw || '[]'));
    return Array.isArray(ids) ? ids.map(Number).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

export function loadPlanCases(teamId, caseIds) {
  const rows = [];
  for (const cid of caseIds) {
    const row = db.prepare(`
      SELECT id, name, portability, default_environment_id, environment_snapshot_json
      FROM cases
      WHERE id = ? AND team_id = ? AND status = 'active'
    `).get(Number(cid), Number(teamId));
    if (row) rows.push(row);
  }
  return rows;
}

/** 判断单条用例是否依赖计划级执行环境 */
export function caseNeedsPlanEnvironment(caseRow) {
  if (!caseRow) return false;
  if (caseRow.portability === 'bundle' && caseHasOwnEnvironment(caseRow)) {
    return false;
  }
  return true;
}

/**
 * 校验计划用例与环境关系。保存用例时不强制绑定环境；执行计划时需 ready_to_execute。
 * @returns {{ ok: boolean, ready_to_execute: boolean, error?: string, portable_cases?: object[], needs_plan_environment: boolean }}
 */
export function validatePlanEnvironment(teamId, caseIds, environmentId) {
  const ids = parseCaseIds(caseIds);
  if (ids.length === 0) {
    return { ok: true, ready_to_execute: true, needs_plan_environment: false, portable_cases: [] };
  }

  const cases = loadPlanCases(teamId, ids);
  const portableCases = cases.filter(caseNeedsPlanEnvironment);
  const envOk = environmentId != null
    && environmentId !== ''
    && Number.isFinite(Number(environmentId));
  const needsPlanEnv = portableCases.length > 0;
  const readyToExecute = !needsPlanEnv || envOk;

  let error;
  if (needsPlanEnv && !envOk) {
    const names = portableCases.map((c) => c.name || `用例 #${c.id}`).join('、');
    error = `以下用例执行时需要计划环境：${names}。请先在「执行配置」中选择环境后再执行。`;
  }

  return {
    ok: true,
    ready_to_execute: readyToExecute,
    needs_plan_environment: needsPlanEnv,
    portable_cases: portableCases.map((c) => ({ id: c.id, name: c.name })),
    error,
  };
}

export function validatePlanRecord(teamId, plan) {
  const caseIds = parseCaseIds(plan.case_ids_json);
  return validatePlanEnvironment(teamId, caseIds, plan.environment_id);
}

/** REQ-L04：计划详情环境摘要 */
export function buildPlanEnvironmentSummary(teamId, plan) {
  const validation = validatePlanRecord(teamId, plan);
  const caseIds = parseCaseIds(plan.case_ids_json);
  const cases = loadPlanCases(teamId, caseIds);

  const portableCases = [];
  const bundleCases = [];
  for (const c of cases) {
    const item = { id: c.id, name: c.name || `用例 #${c.id}` };
    if (caseNeedsPlanEnvironment(c)) portableCases.push(item);
    else bundleCases.push(item);
  }

  let planEnvironment = null;
  if (plan.environment_id != null && plan.environment_id !== '') {
    planEnvironment = db.prepare(`
      SELECT id, name, env_kind, base_url
      FROM execution_environments
      WHERE id = ? AND team_id = ?
    `).get(Number(plan.environment_id), Number(teamId));
  }

  const portableCount = portableCases.length;
  const bundleCount = bundleCases.length;
  let summaryText = '';
  if (cases.length === 0) {
    summaryText = '尚未绑定用例';
  } else if (planEnvironment) {
    summaryText = `本计划环境：${planEnvironment.name}`;
    if (portableCount > 0 && bundleCount > 0) {
      summaryText += `；${portableCount} 条通用用例将使用此环境，${bundleCount} 条绑定包使用各自环境`;
    } else if (portableCount > 0) {
      summaryText += `；${portableCount} 条通用用例将使用此环境`;
    } else if (bundleCount > 0) {
      summaryText += `；${bundleCount} 条绑定包使用各自环境`;
    }
  } else if (portableCount > 0) {
    summaryText = `${portableCount} 条通用用例，执行前需配置计划环境`;
  } else {
    summaryText = `${bundleCount} 条绑定包使用各自环境，无需计划环境`;
  }

  return {
    ...validation,
    plan_environment: planEnvironment,
    total_cases: cases.length,
    portable_count: portableCount,
    bundle_own_env_count: bundleCount,
    portable_cases: portableCases,
    bundle_cases: bundleCases,
    summary_text: summaryText,
  };
}
