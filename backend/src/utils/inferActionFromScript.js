/** 从 Playwright 脚本反推可读操作步骤（规则推断，action 为空时使用） */

function unquote(s) {
  return String(s || '').replace(/^['"`]|['"`]$/g, '').trim();
}

function extractRoleName(fragment) {
  const m = String(fragment || '').match(/name:\s*(?:\/(.+?)\/|['"`]([^'"`]+)['"`])/);
  if (!m) return '';
  return unquote(m[1] || m[2] || '');
}

function describeAwaitLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('await ') && !trimmed.startsWith('expect(')) return null;

  let m = trimmed.match(/page\.goto\(\s*['"`]([^'"`]+)['"`]/);
  if (m) return `打开 ${m[1]}`;

  m = trimmed.match(/waitForURL\(/);
  if (m) return '等待页面跳转';

  m = trimmed.match(/waitForTimeout\(\s*(\d+)/);
  if (m) return `等待 ${m[1]}ms`;

  if (/expect\s*\(/.test(trimmed)) {
    const textM = trimmed.match(/getByText\([^)]*['"`]([^'"`]+)['"`]/);
    if (textM) return `断言可见「${textM[1]}」`;
    return '断言页面状态';
  }

  if (trimmed.includes('.fill(')) {
    const fillM = trimmed.match(/\.fill\(\s*['"`]([^'"`]*)['"`]/);
    const roleM = trimmed.match(/getByRole\(([^)]+)\)/);
    const name = extractRoleName(roleM?.[1] || '');
    const value = fillM?.[1] ?? '';
    if (name) return `在「${name}」输入「${value}」`;
    return value ? `输入「${value}」` : '输入内容';
  }

  if (trimmed.includes('.click(')) {
    const roleM = trimmed.match(/getByRole\(([^)]+)\)/);
    const roleName = extractRoleName(roleM?.[1] || '');
    if (roleName) return `点击「${roleName}」`;
    const textM = trimmed.match(/getByText\([^)]*['"`]([^'"`]+)['"`]/);
    if (textM) return `点击文字「${textM[1]}」`;
    return '点击元素';
  }

  if (trimmed.includes('keyboard.type(')) {
    const typeM = trimmed.match(/keyboard\.type\(\s*['"`]([^'"`]+)['"`]/);
    if (typeM) return `键入「${typeM[1]}」`;
  }

  if (trimmed.includes('keyboard.press(')) {
    const keyM = trimmed.match(/keyboard\.press\(\s*['"`]([^'"`]+)['"`]/);
    if (keyM) return `按键 ${keyM[1]}`;
  }

  if (trimmed.includes('.check(')) return '勾选元素';
  if (trimmed.includes('.uncheck(')) return '取消勾选';
  if (trimmed.includes('.hover(')) return '悬停元素';
  if (trimmed.includes('.selectOption(')) return '选择下拉项';

  return null;
}

export function inferActionFromScript(script) {
  const lines = String(script || '').split('\n');
  const steps = [];
  for (const line of lines) {
    const comment = line.match(/^\s*\/\/\s*(.+)/);
    if (comment && !comment[1].startsWith('@')) {
      steps.push(comment[1].trim());
      continue;
    }
    const desc = describeAwaitLine(line);
    if (desc) steps.push(desc);
  }
  if (!steps.length) return '';
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}
