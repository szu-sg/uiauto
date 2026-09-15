/** 从 Playwright 脚本推断用例名称 */
export function inferNameFromScript(script) {
  const s = String(script || '');
  const m = s.match(/test\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (m) return m[1].trim();
  return '';
}

export function inferNameFromScriptFile(filename) {
  return String(filename || '')
    .replace(/\.(spec|test)\.(ts|js)$/i, '')
    .replace(/\.(ts|js)$/i, '')
    .replace(/\.zip$/i, '')
    .trim();
}

function parseYamlCaseBlock(text) {
  const raw = String(text || '').trim();
  const blockMatch = raw.match(/^\/\*\s*\n?\s*case:\s*([\s\S]*?)\*\/\s*/);
  if (!blockMatch) return null;

  const yamlText = blockMatch[1];
  const script = raw.slice(blockMatch[0].length).trim();
  const meta = {};

  const descMatch = yamlText.match(/description:\s*\|\s*\n((?:[ \t]+[^\n]*\n?)*)/);
  if (descMatch) {
    meta.description = descMatch[1]
      .split('\n')
      .map((line) => line.replace(/^[ \t]+/, ''))
      .join('\n')
      .trim();
  } else {
    const inlineDesc = yamlText.match(/description:\s*(.+)/);
    if (inlineDesc) meta.description = inlineDesc[1].trim();
  }

  const priorityMatch = yamlText.match(/priority:\s*(\S+)/);
  if (priorityMatch) meta.priority = priorityMatch[1].trim();

  const moduleMatch = yamlText.match(/module:\s*(.+)/);
  if (moduleMatch) meta.module = moduleMatch[1].trim();

  const tagsMatch = yamlText.match(/tags:\s*\[([^\]]*)\]/);
  if (tagsMatch) {
    meta.tags = tagsMatch[1]
      .split(',')
      .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  return { meta, script };
}

/**
 * 识别剪贴板 / 粘贴文本类型
 * @returns {{ kind: string, [key: string]: unknown }}
 */
export function parseImportClipboard(text) {
  const raw = String(text || '').trim();
  if (!raw) return { kind: 'empty' };

  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && Array.isArray(data.cases)) {
        return { kind: 'batch-json', cases: data.cases };
      }
      if (data && typeof data === 'object' && (data.script || data.name)) {
        return { kind: 'bundle-json', bundle: data };
      }
    } catch {
      /* fall through */
    }
  }

  const yamlBlock = parseYamlCaseBlock(raw);
  if (yamlBlock?.script) {
    return {
      kind: 'script-with-meta',
      script: yamlBlock.script,
      name: inferNameFromScript(yamlBlock.script),
      ...yamlBlock.meta,
    };
  }

  if (/test\s*\(|@playwright\/test/i.test(raw)) {
    return {
      kind: 'script',
      script: raw,
      name: inferNameFromScript(raw),
    };
  }

  return { kind: 'unknown', text: raw };
}

/** 将 bundle JSON 字段应用到表单 setter */
export function applyBundleToForm(bundle, setters) {
  if (!bundle || typeof bundle !== 'object') return;
  const {
    setName,
    setDescription,
    setAction,
    setPriority,
    setTags,
    setScript,
    setContextJson,
  } = setters;

  if (bundle.name && setName) setName(String(bundle.name).trim());
  if (bundle.description != null && setDescription) {
    setDescription(String(bundle.description).trim());
  }
  if (bundle.action != null && setAction) {
    setAction(String(bundle.action).trim());
  }
  if (bundle.priority && setPriority) setPriority(String(bundle.priority).trim());
  if (Array.isArray(bundle.tags) && setTags) setTags(bundle.tags.map((t) => String(t).trim()).filter(Boolean));
  if (bundle.script && setScript) setScript(String(bundle.script));

  const storageState = bundle.auth?.storage_state || bundle.storage_state;
  if (storageState && setContextJson) {
    setContextJson(JSON.stringify(storageState, null, 2));
  }
}

export function buildBatchItemFromFile(filename, script, defaults = {}) {
  return {
    id: `${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    name: inferNameFromScriptFile(filename) || inferNameFromScript(script) || '导入用例',
    description: defaults.description || '',
    action: defaults.action || '',
    module: defaults.module || '',
    priority: defaults.priority || 'P0',
    tags: defaults.tags ? [...defaults.tags] : [],
    script,
  };
}

/** 录制步骤 → 可读操作文本 */
export function stepsToActionText(steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return '';
  return list
    .map((step, i) => {
      const label = String(step?.label || step?.text || step?.type || '步骤').trim();
      return `${i + 1}. ${label}`;
    })
    .join('\n');
}
