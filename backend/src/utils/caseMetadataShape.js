/** 平台用例 metadata 统一结构（录制 / 导入一致） */

export function detectScriptLanguage(script) {
  const s = String(script || '');
  if (/\.tsx?\b|:\s*['"]typescript['"]/i.test(s)) return 'typescript';
  return 'javascript';
}

/**
 * @param {object} opts
 * @param {string} [opts.source] recorded | imported
 * @param {string} [opts.script]
 * @param {string} [opts.language]
 * @param {Array} [opts.steps]
 * @param {string} [opts.module]
 * @param {Array} [opts.tags]
 * @param {boolean} [opts.scriptStale]
 * @param {object} [opts.extra]
 */
export function buildCaseMetadata({
  source = 'recorded',
  script = '',
  language,
  steps = [],
  module = '其他',
  tags = [],
  scriptStale = false,
  extra = {},
} = {}) {
  const tagList = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const meta = {
    source: String(source || 'recorded').trim() || 'recorded',
    module: String(module || '其他').trim() || '其他',
    language: language || detectScriptLanguage(script),
    scriptStale: !!scriptStale,
    steps: Array.isArray(steps) ? steps : [],
    ...extra,
  };
  delete meta.action;
  if (tagList.length) meta.tags = tagList;
  return meta;
}
