import AdmZip from 'adm-zip';
import { importCaseBatch } from './caseImport.js';
import { findOrCreateFolderByName } from './caseFolderService.js';
import { findDuplicateCase } from './caseImportDedup.js';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';
import { resolveImportSteps } from '../utils/parseImportSteps.js';

const HEADER_ALIASES = {
  name: ['用例名称', '名称', 'name', 'case_name', 'title'],
  priority: ['优先级', 'priority'],
  module: ['模块', '文件夹', 'module', 'folder'],
  tags: ['标签', 'tags'],
  description: ['备注', '描述', 'description', 'remark'],
  action: ['操作', '操作步骤', 'action', 'steps'],
  script: ['脚本', 'script', 'spec'],
  auth: ['auth', '认证', 'cookie', 'storage_state', '登录态'],
};

function normalizeHeader(cell) {
  return String(cell || '').trim().toLowerCase();
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    const key = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => key === a.toLowerCase() || key.includes(a.toLowerCase()))) {
        if (map[field] == null) map[field] = idx;
      }
    }
  });
  return map;
}

function cellValue(row, idx) {
  if (idx == null || idx < 0) return '';
  const v = row[idx];
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function parseTags(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((t) => String(t).trim()).filter(Boolean) : [];
    } catch {
      /* fall through */
    }
  }
  return s.split(/[,，;；]/).map((t) => t.trim()).filter(Boolean);
}

function parseAuth(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const data = JSON.parse(s);
    return filterEssentialStorageState(data);
  } catch {
    return null;
  }
}

function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      if (n === 10 || n === 13) return '\n';
      if (n === 9) return '\t';
      return String.fromCharCode(n);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      if (n === 10 || n === 13) return '\n';
      if (n === 9) return '\t';
      return String.fromCharCode(n);
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colLettersToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseCellRef(ref) {
  const m = String(ref || '').match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colLettersToIndex(m[1]), row: Number(m[2]) - 1 };
}

function parseSharedStrings(xml) {
  const strings = [];
  const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    const text = parts
      .map((p) => decodeXmlEntities(p.replace(/<\/?t[^>]*>/g, '')))
      .join('');
    strings.push(text);
  }
  return strings;
}

function parseSheetXml(xml, sharedStrings) {
  const sparse = [];
  const rowMatches = xml.match(/<row[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const rAttr = rowXml.match(/\br="(\d+)"/);
    const rowIdx = rAttr ? Number(rAttr[1]) - 1 : sparse.length;
    const cells = [];
    const cellMatches = rowXml.match(/<c[\s\S]*?<\/c>/g) || [];
    for (const cell of cellMatches) {
      const ref = cell.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = cell.match(/\bt="([^"]+)"/)?.[1];
      const pos = parseCellRef(ref);
      if (!pos) continue;
      let value = '';
      if (type === 'inlineStr') {
        value = cell.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
        value = decodeXmlEntities(value);
      } else {
        const raw = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        if (type === 's') value = sharedStrings[Number(raw)] ?? '';
        else value = decodeXmlEntities(raw);
      }
      cells.push({ col: pos.col, value });
    }
    const arr = [];
    for (const c of cells) arr[c.col] = c.value;
    sparse[rowIdx] = arr;
  }
  const maxLen = sparse.length;
  return Array.from({ length: maxLen }, (_, i) => sparse[i] || []);
}

function parseXlsxBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const sheetEntry = entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.entryName));
  if (!sheetEntry) throw new Error('Excel 内未找到工作表');
  const ssEntry = entries.find((e) => e.entryName === 'xl/sharedStrings.xml');
  const sharedStrings = ssEntry
    ? parseSharedStrings(ssEntry.getData().toString('utf8'))
    : [];
  const sheetXml = sheetEntry.getData().toString('utf8');
  return parseSheetXml(sheetXml, sharedStrings);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsvBuffer(buffer) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => parseCsvLine(line));
}

export function parseSpreadsheetBuffer(buffer, filename = '') {
  const lower = String(filename || '').toLowerCase();
  const rows = lower.endsWith('.csv')
    ? parseCsvBuffer(buffer)
    : parseXlsxBuffer(buffer);
  if (!rows.length) throw new Error('表格为空');

  const headerRowIdx = rows.findIndex((row) => row.some((c) => normalizeHeader(c)));
  if (headerRowIdx < 0) throw new Error('未找到表头行');
  const headerMap = buildHeaderMap(rows[headerRowIdx]);
  if (headerMap.name == null && headerMap.script == null) {
    throw new Error('表头须包含「用例名称」与「脚本」列（可参考 UI自动化用例.xlsx）');
  }

  const items = [];
  for (let i = headerRowIdx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.some((c) => String(c || '').trim())) continue;

    const name = cellValue(row, headerMap.name);
    const script = cellValue(row, headerMap.script);
    if (!name && !script) continue;
    if (!script) continue;

    const moduleName = cellValue(row, headerMap.module);
    const item = {
      name: name || '导入用例',
      script,
      priority: cellValue(row, headerMap.priority) || null,
      description: cellValue(row, headerMap.description) || null,
      action: cellValue(row, headerMap.action) || null,
      tags: parseTags(cellValue(row, headerMap.tags)),
      module: moduleName || null,
    };

    const auth = parseAuth(cellValue(row, headerMap.auth));
    if (auth) item.auth = { storage_state: auth };

    items.push(item);
  }

  if (!items.length) throw new Error('未解析到有效用例行（每行须含脚本）');
  return { items, headerRowIdx };
}

export function previewSpreadsheetBatch(teamId, buffer, { filename } = {}) {
  const { items, headerRowIdx } = parseSpreadsheetBuffer(buffer, filename);
  const rows = items.map((item, idx) => {
    const steps = resolveImportSteps({ actionRaw: item.action, script: item.script });
    const duplicate = findDuplicateCase(teamId, item.name, item.script);
    return {
      row: headerRowIdx + idx + 2,
      name: item.name,
      priority: item.priority,
      module: item.module,
      tags: item.tags,
      description: item.description,
      stepsCount: steps.length,
      hasAuth: !!item.auth,
      duplicate: duplicate
        ? { id: duplicate.id, name: duplicate.name, matchBy: duplicate.matchBy }
        : null,
    };
  });
  const duplicateCount = rows.filter((r) => r.duplicate).length;
  return {
    total: rows.length,
    duplicateCount,
    newCount: rows.length - duplicateCount,
    rows,
  };
}

export function importSpreadsheetBatch(teamId, userId, buffer, {
  filename,
  folder_id: defaultFolderId,
  defaults,
  skip_duplicates: skipDuplicates = true,
} = {}) {
  const { items: parsedItems } = parseSpreadsheetBuffer(buffer, filename);
  const items = parsedItems.map((item) => {
    if (skipDuplicates) {
      const duplicate = findDuplicateCase(teamId, item.name, item.script);
      if (duplicate) {
        return {
          skip: true,
          name: item.name,
          duplicate,
          skip_reason: duplicate.matchBy === 'name' ? '同名用例已存在' : '相同脚本已存在',
        };
      }
    }
    let folderId = defaultFolderId ?? null;
    if (item.module) {
      try {
        folderId = findOrCreateFolderByName(teamId, item.module);
      } catch {
        /* 模块名无效则沿用默认文件夹 */
      }
    }
    const payload = {
      name: item.name,
      script: item.script,
      description: item.description,
      action: item.action,
      priority: item.priority ?? defaults?.priority ?? null,
      tags: item.tags?.length ? item.tags : (defaults?.tags || []),
      folder_id: folderId,
    };
    if (item.auth) payload.auth = item.auth;
    return payload;
  });

  return importCaseBatch(teamId, userId, {
    folder_id: defaultFolderId,
    defaults,
    items,
  });
}
