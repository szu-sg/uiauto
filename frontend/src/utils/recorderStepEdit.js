/** 录制步骤编辑：类型映射、表单构建、展示文案 */

export const STEP_TYPE_LABEL = {
  goto: '导航',
  click: '点击',
  fill: '输入',
  select: '选择',
  check: '勾选',
  uncheck: '取消勾选',
  hover: '悬停',
  scroll: '滚动',
  wait: '固定等待',
  waitFor: '等待元素',
  assert: '断言',
  label: '备注',
};

export const EDIT_STEP_TYPES = [
  { value: 'goto', label: '打开网址', group: '页面' },
  { value: 'click', label: '点击', group: '操作' },
  { value: 'fill', label: '输入文字', group: '操作' },
  { value: 'select', label: '下拉选择', group: '操作' },
  { value: 'check', label: '勾选', group: '操作' },
  { value: 'uncheck', label: '取消勾选', group: '操作' },
  { value: 'hover', label: '悬停', group: '操作' },
  { value: 'scroll', label: '滚动', group: '滚动与等待' },
  { value: 'waitFor', label: '等待元素出现', group: '滚动与等待' },
  { value: 'wait', label: '固定等待', group: '滚动与等待' },
  { value: 'assert', label: '断言', group: '检查' },
  { value: 'label', label: '注释', group: '说明' },
];

export const ASSERT_OPERATORS = [
  { value: 'visible', label: '可见' },
  { value: 'attached', label: '存在' },
  { value: 'hidden', label: '消失' },
  { value: 'eq', label: '文本等于' },
  { value: 'contains', label: '文本包含' },
];

const LOCATOR_TYPES = new Set(['click', 'fill', 'select', 'check', 'uncheck', 'assert', 'hover', 'waitFor']);

export function stepNeedsLocator(type) {
  return LOCATOR_TYPES.has(String(type || '').toLowerCase());
}

export function stepNeedsValue(type) {
  const t = String(type || '').toLowerCase();
  return t === 'fill' || t === 'select';
}

export function assertNeedsText(operator) {
  return operator === 'eq' || operator === 'contains';
}

export function humanStepLabel(step) {
  if (!step) return '';
  const type = String(step.type || '').toLowerCase();
  const sel = step.stableSelector || step.selectorLabel || step.scrollTarget || '';
  if (type === 'goto') return `打开 ${step.url || ''}`;
  if (type === 'fill') return `输入「${String(step.value ?? '').slice(0, 40)}」`;
  if (type === 'click') return `点击 ${step.ariaName || sel || '元素'}`;
  if (type === 'select') return `选择 ${step.value ?? ''}`;
  if (type === 'check') return `勾选 ${step.ariaName || sel}`;
  if (type === 'uncheck') return `取消勾选 ${step.ariaName || sel}`;
  if (type === 'hover') return `悬停 ${step.ariaName || sel || '元素'}`;
  if (type === 'waitfor') return `等待元素出现 ${sel}`;
  if (type === 'scroll') {
    const parts = [];
    if (step.deltaTop) parts.push(`↓${step.deltaTop}px`);
    if (step.deltaLeft) parts.push(`→${step.deltaLeft}px`);
    return `滚动 ${step.scrollTarget || 'html'} ${parts.join(' ')}`.trim();
  }
  if (type === 'assert') return step.label || `断言 ${step.assertOperator || 'visible'}`;
  if (type === 'wait') return `等待 ${step.ms || 0}ms`;
  if (type === 'label') return step.text || step.label || '备注';
  return step.label || type;
}

export function formFromStep(step) {
  if (!step) {
    return {
      type: 'click',
      url: '',
      locator: '',
      value: '',
      ms: 1000,
      labelText: '',
      assertOperator: 'visible',
      assertText: '',
      scrollTarget: 'html',
      scrollVDir: 'down',
      scrollVPx: 400,
      scrollHDir: 'none',
      scrollHPx: 0,
    };
  }
  const type = String(step.type || 'click').toLowerCase();
  return {
    type: type === 'waitfor' ? 'waitFor' : type,
    url: step.url || '',
    locator: step.stableSelector || step.selectorLabel || '',
    value: step.value != null ? String(step.value) : '',
    ms: Number(step.ms) || 1000,
    labelText: step.text || step.label || '',
    assertOperator: step.assertOperator || 'visible',
    assertText: step.text || '',
    scrollTarget: step.scrollTarget || step.stableSelector || 'html',
    scrollVDir: (step.deltaTop || 0) < 0 ? 'up' : ((step.deltaTop || 0) > 0 ? 'down' : 'none'),
    scrollVPx: Math.abs(Number(step.deltaTop) || 0) || 400,
    scrollHDir: (step.deltaLeft || 0) < 0 ? 'left' : ((step.deltaLeft || 0) > 0 ? 'right' : 'none'),
    scrollHPx: Math.abs(Number(step.deltaLeft) || 0),
  };
}

export function buildStepFromForm(form, prevStep = null) {
  const type = String(form.type || 'click').toLowerCase();
  const id = prevStep?.id || `step-${Date.now()}`;
  const timestamp = prevStep?.timestamp || Date.now();
  const baseExtra = {
    frameChain: prevStep?.frameChain,
    inIframe: prevStep?.inIframe,
    matchCount: prevStep?.matchCount,
  };

  if (type === 'goto') {
    const url = String(form.url || '').trim();
    if (!url) return { error: '请填写网址 URL' };
    return { step: { id, type: 'goto', url, label: `打开 ${url}`, timestamp, ...baseExtra } };
  }

  if (type === 'wait') {
    const ms = Math.min(120000, Math.max(100, Number(form.ms) || 1000));
    return { step: { id, type: 'wait', ms, label: `等待 ${ms}ms`, timestamp, ...baseExtra } };
  }

  if (type === 'label') {
    const text = String(form.labelText || '').trim();
    if (!text) return { error: '请填写注释说明' };
    return { step: { id, type: 'label', text, label: text, timestamp, ...baseExtra } };
  }

  if (type === 'scroll') {
    const scrollTarget = String(form.scrollTarget || 'html').trim() || 'html';
    const vDir = form.scrollVDir || 'none';
    const hDir = form.scrollHDir || 'none';
    const deltaTop = vDir === 'down' ? Number(form.scrollVPx) || 0 : vDir === 'up' ? -(Number(form.scrollVPx) || 0) : 0;
    const deltaLeft = hDir === 'right' ? Number(form.scrollHPx) || 0 : hDir === 'left' ? -(Number(form.scrollHPx) || 0) : 0;
    const step = {
      id,
      type: 'scroll',
      scrollTarget,
      stableSelector: scrollTarget,
      selectorLabel: scrollTarget,
      deltaTop,
      deltaLeft,
      timestamp,
      ...baseExtra,
    };
    step.label = humanStepLabel(step);
    return { step };
  }

  if (type === 'assert') {
    const operator = form.assertOperator || 'visible';
    const locator = String(form.locator || '').trim();
    const assertText = String(form.assertText || '').trim();
    if (!locator && !prevStep?.stableSelector) return { error: '请填写断言元素的定位' };
    if (assertNeedsText(operator) && !assertText) return { error: '请填写期望文本' };
    const step = {
      id,
      type: 'assert',
      stableSelector: locator || prevStep?.stableSelector || '',
      selectorLabel: locator || prevStep?.selectorLabel || '',
      assertOperator: operator,
      text: assertNeedsText(operator) ? assertText : (prevStep?.text || ''),
      ariaRole: prevStep?.ariaRole,
      ariaName: prevStep?.ariaName,
      locatorPlan: prevStep?.locatorPlan,
      timestamp,
      ...baseExtra,
    };
    step.label = humanStepLabel(step);
    return { step };
  }

  if (stepNeedsLocator(type)) {
    const locator = String(form.locator || '').trim();
    if (!locator) return { error: '请填写元素定位' };
    const value = String(form.value ?? '').trim();
    if (stepNeedsValue(type) && !value) {
      return { error: type === 'select' ? '请填写选项值' : '请填写输入内容' };
    }
    const step = {
      id,
      type: type === 'waitfor' ? 'waitFor' : type,
      stableSelector: locator,
      selectorLabel: locator,
      ariaRole: prevStep?.ariaRole,
      ariaName: prevStep?.ariaName,
      locatorPlan: prevStep?.locatorPlan,
      value: stepNeedsValue(type) ? value : prevStep?.value,
      timestamp,
      ...baseExtra,
    };
    step.label = humanStepLabel(step);
    return { step };
  }

  return { error: '不支持的步骤类型' };
}

const KNOWN_STEP_TYPES = new Set([
  'goto', 'click', 'fill', 'select', 'check', 'uncheck', 'hover',
  'scroll', 'wait', 'waitfor', 'waitFor', 'assert', 'label',
]);

export function normalizeStepObject(raw, prevStep = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '必须是 JSON 对象' };
  }
  const typeRaw = String(raw.type || '').trim();
  if (!typeRaw) return { error: '缺少 type 字段' };
  const typeLower = typeRaw.toLowerCase();
  if (!KNOWN_STEP_TYPES.has(typeRaw) && !KNOWN_STEP_TYPES.has(typeLower)) {
    return { error: `不支持的 type: ${typeRaw}` };
  }
  const type = typeLower === 'waitfor' ? 'waitFor' : typeLower;
  const id = raw.id || prevStep?.id || `step-${Date.now()}`;
  const timestamp = raw.timestamp || prevStep?.timestamp || Date.now();
  const step = {
    ...prevStep,
    ...raw,
    id,
    type,
    timestamp,
  };
  if (!step.label) step.label = humanStepLabel(step);
  return { step };
}

export function parseStepFromJson(text, prevStep = null) {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'JSON 不能为空' };
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return { error: '请提供单个步骤对象，不是数组' };
    return normalizeStepObject(data, prevStep);
  } catch (e) {
    return { error: `JSON 解析失败：${e.message}` };
  }
}

export function parseStepsFromJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'JSON 不能为空' };
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return { error: '根节点必须是步骤数组' };
    const steps = [];
    for (let i = 0; i < data.length; i += 1) {
      const result = normalizeStepObject(data[i]);
      if (result.error) return { error: `第 ${i + 1} 项：${result.error}` };
      steps.push(result.step);
    }
    return { steps };
  } catch (e) {
    return { error: `JSON 解析失败：${e.message}` };
  }
}

export function defaultStepJsonTemplate() {
  return JSON.stringify({
    type: 'click',
    stableSelector: "getByRole('button', { name: '确定' })",
    label: '点击确定',
  }, null, 2);
}

export function buildAssertStepFromDraft(target, { operator, text }) {
  if ((operator === 'eq' || operator === 'contains') && !text) {
    return { error: '请填写期望文本' };
  }
  const step = {
    id: `step-${Date.now()}`,
    type: 'assert',
    stableSelector: target.selector || '',
    selectorLabel: target.selector || '',
    ariaRole: target.ariaRole,
    ariaName: target.ariaName,
    assertOperator: operator || 'visible',
    text: text || target.text || '',
    label: `断言 ${operator || 'visible'}`,
    timestamp: Date.now(),
  };
  step.label = humanStepLabel(step);
  return { step };
}

export function stepTypeIcon(type) {
  const map = {
    goto: '🌐',
    click: '👆',
    fill: '⌨️',
    select: '🔽',
    check: '☑️',
    uncheck: '⬜',
    hover: '🖱',
    scroll: '📜',
    wait: '⏱',
    waitfor: '⏳',
    assert: '✓',
    label: '🏷',
  };
  return map[String(type || '').toLowerCase()] || '•';
}

export const LANGUAGE_OPTIONS = [
  { value: 'typescript', label: 'TypeScript', ext: 'spec.ts', badge: 'TS' },
  { value: 'javascript', label: 'JavaScript', ext: 'spec.js', badge: 'JS' },
  { value: 'python', label: 'Python', ext: 'test.py', badge: 'PY' },
];

export const DEVICE_PRESETS = [
  { value: '1920x1080', label: 'Desktop 1920×1080', width: 1920, height: 1080 },
  { value: '1280x720', label: '1280 × 720', width: 1280, height: 720 },
  { value: '1280x1080', label: '1280 × 1080', width: 1280, height: 1080 },
  { value: '390x844', label: '390 × 844 (Mobile)', width: 390, height: 844 },
];
