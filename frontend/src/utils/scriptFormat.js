/** 解码 Excel / HTML 实体，修复导入脚本中的 &#10; 等 */

export function decodeScriptEntities(text) {
  let s = String(text || '');
  s = s.replace(/&#(\d+);/g, (_, code) => {
    const n = Number(code);
    if (n === 10 || n === 13) return '\n';
    if (n === 9) return '\t';
    return String.fromCharCode(n);
  });
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const n = parseInt(hex, 16);
    if (n === 10 || n === 13) return '\n';
    if (n === 9) return '\t';
    return String.fromCharCode(n);
  });
  s = s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function basicIndent(source) {
  const lines = String(source || '').split('\n');
  const out = [];
  let depth = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push('');
      continue;
    }
    if (/^[}\])]/.test(line)) depth = Math.max(0, depth - 1);
    out.push(`${'  '.repeat(depth)}${line}`);
    if (/[{[(]\s*$/.test(line) || /\{\s*$/.test(line)) depth += 1;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** 规范化并简单格式化 Playwright 脚本 */
export function formatPlaywrightScript(script) {
  let s = decodeScriptEntities(script).trim();
  if (!s) return s;

  if (!s.includes('\n')) {
    s = s
      .replace(/;\s*(?=(?:await |import |test\(|expect\(|const |let |\/\/))/g, ';\n')
      .replace(/\{\s*/g, '{\n')
      .replace(/\}\s*/g, '\n}\n');
  }

  return basicIndent(s);
}

export function normalizeScriptText(script) {
  return decodeScriptEntities(script);
}

export function scriptNeedsFormat(script) {
  const s = String(script || '');
  return s.includes('&#10;') || s.includes('&#13;') || (!s.includes('\n') && s.includes(';') && s.length > 120);
}
