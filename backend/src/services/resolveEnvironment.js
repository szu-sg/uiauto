/**
 * 用例 / 计划执行时的环境解析。
 * 规则：用例有自带环境 → 用用例的；无 → 用计划统一环境；试跑可显式覆盖。
 * 登录：用例有录制上下文（storageState）时优先注入；否则按此处解析的环境账号登录。
 */

export function caseHasOwnEnvironment(caseRow) {
  if (!caseRow) return false;
  if (caseRow.default_environment_id != null && caseRow.default_environment_id !== '') return true;
  const snap = caseRow.environment_snapshot_json;
  return !!(snap && String(snap).trim());
}

export function parseEnvironmentSnapshot(caseRow) {
  if (!caseRow?.environment_snapshot_json) return null;
  try {
    const o = JSON.parse(String(caseRow.environment_snapshot_json));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
}

/**
 * @returns {number|null} execution_environments.id
 */
export function resolveExecutionEnvironmentId({ caseRow, plan, overrideEnvId }) {
  if (overrideEnvId != null && overrideEnvId !== '') {
    return Number(overrideEnvId);
  }
  if (caseRow?.default_environment_id != null && caseRow.default_environment_id !== '') {
    return Number(caseRow.default_environment_id);
  }
  if (plan?.environment_id != null && plan.environment_id !== '') {
    return Number(plan.environment_id);
  }
  return null;
}

/**
 * @returns {{ envId: number|null, snapshot: object|null, source: string }}
 */
export function resolveExecutionEnvironment({ caseRow, plan, overrideEnvId }) {
  if (overrideEnvId != null && overrideEnvId !== '') {
    return { envId: Number(overrideEnvId), snapshot: null, source: 'override' };
  }
  if (caseRow?.default_environment_id != null && caseRow.default_environment_id !== '') {
    return {
      envId: Number(caseRow.default_environment_id),
      snapshot: null,
      source: 'case',
    };
  }
  const snap = parseEnvironmentSnapshot(caseRow);
  if (snap) {
    return { envId: null, snapshot: snap, source: 'case_snapshot' };
  }
  if (plan?.environment_id != null && plan.environment_id !== '') {
    return { envId: Number(plan.environment_id), snapshot: null, source: 'plan' };
  }
  return { envId: null, snapshot: null, source: 'none' };
}

/** 将 environment_snapshot_json 转为 executor 可消费的行结构 */
export function snapshotToExecEnvRow(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    env_kind: snapshot.env_kind || 'test',
    base_url: snapshot.base_url || '',
    headers_json: JSON.stringify(Array.isArray(snapshot.headers) ? snapshot.headers : []),
    test_username: snapshot.test_username || '',
    test_password: snapshot.test_password || '',
    wps_company_name: snapshot.wps_company_name || '',
    switchhosts_text: snapshot.switchhosts_text || '',
    extra_env_json: JSON.stringify(
      snapshot.extra_env && typeof snapshot.extra_env === 'object' && !Array.isArray(snapshot.extra_env)
        ? snapshot.extra_env
        : {},
    ),
  };
}
