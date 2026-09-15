/** 解码 Excel / HTML 实体，修复导入脚本中的 &#10; 等 */

export function normalizeScriptText(text) {
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
