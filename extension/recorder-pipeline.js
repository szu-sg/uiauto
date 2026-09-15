/** 录制步骤归一化与合并（移植自 playwright-record-store） */

const CLICK_DEDUP_WINDOW_MS = 500;
const NAVIGATE_AFTER_CLICK_MS = 3500;
const NAVIGATE_CHAIN_MS = 1500;

const TYPE_MAP = {
  click: 'CLICK',
  type: 'FILL',
  fill: 'FILL',
  navigate: 'NAVIGATE',
  goto: 'NAVIGATE',
  scroll: 'SCROLL',
  hover: 'HOVER',
  select: 'SELECT',
  check: 'CHECK',
  uncheck: 'UNCHECK',
  wait: 'SLEEP',
  waitfor: 'WAIT',
  assert: 'ASSERT',
  sleep: 'SLEEP',
  label: 'LABEL',
};

export function normalizeActionType(type) {
  const key = String(type || '').toLowerCase();
  return TYPE_MAP[key] || String(type || '').toUpperCase();
}

export function normalizeNavigateUrl(url) {
  const s = String(url || '').trim();
  if (!s || s.startsWith('chrome://') || s.startsWith('chrome-extension://')) return '';
  return s;
}

export function shouldRecordURL(url) {
  const u = normalizeNavigateUrl(url);
  if (!u) return false;
  return !u.startsWith('about:');
}

export function normalizeStoredAction(action) {
  if (!action || typeof action !== 'object') return null;
  const type = normalizeActionType(action.type);
  if (type === 'HOVER') return null;

  const stableSelector = String(action.stableSelector || action.selector || '').trim();
  const normalized = {
    ...action,
    type,
    stableSelector,
    selector: stableSelector || action.selector || '',
    ariaRole: action.ariaRole || action.role || '',
    ariaName: action.ariaName || '',
    recordedAt: Number(action.recordedAt) || Date.now(),
  };

  if (type === 'NAVIGATE') {
    const url = normalizeNavigateUrl(action.value || action.url);
    if (!url) return null;
    normalized.value = url;
    normalized.url = url;
    delete normalized.stableSelector;
    delete normalized.selector;
    return normalized;
  }

  if (['CLICK', 'FILL', 'SELECT', 'CHECK', 'UNCHECK', 'WAIT', 'SCROLL', 'ASSERT'].includes(type) && !stableSelector && type !== 'SCROLL') {
    return null;
  }
  return normalized;
}

function actionFingerprint(action) {
  return JSON.stringify({
    t: action.type,
    s: action.stableSelector || action.selector || '',
    v: action.value ?? '',
    r: action.ariaRole || '',
    n: action.ariaName || '',
  });
}

export function applyNavigateToActions(actions, normalized) {
  const url = normalized.value;
  const nowTs = Number(normalized.recordedAt) || Date.now();
  const last = actions[actions.length - 1];

  if (last?.type === 'NAVIGATE' && last.value === url) return 'skip';

  if (last?.type === 'CLICK') {
    const lastTs = Number(last.recordedAt) || 0;
    if (nowTs - lastTs < NAVIGATE_AFTER_CLICK_MS) {
      actions[actions.length - 1] = {
        ...last,
        afterClickUrl: url,
        opensNewTab: normalized.tabId != null && last.tabId != null && normalized.tabId !== last.tabId,
      };
      return 'merged-into-click';
    }
  }

  if (last?.type === 'NAVIGATE') {
    const lastTs = Number(last.recordedAt) || 0;
    if (nowTs - lastTs < NAVIGATE_CHAIN_MS) {
      actions[actions.length - 1] = { ...normalized };
      return 'replaced';
    }
  }

  actions.push(normalized);
  return 'append';
}

export function mergeActionIntoList(actions, action) {
  const last = actions[actions.length - 1];
  const normType = action.type;
  const nowTs = Number(action.recordedAt) || Date.now();

  if (
    normType === 'FILL' &&
    last?.type === 'FILL' &&
    (last.stableSelector || last.selector) === (action.stableSelector || action.selector)
  ) {
    actions[actions.length - 1] = { ...last, ...action, type: 'FILL' };
    return true;
  }

  if (
    normType === 'CLICK' &&
    last?.type === 'CLICK' &&
    (last.stableSelector || last.selector) === (action.stableSelector || action.selector)
  ) {
    const lastTs = Number(last.recordedAt) || 0;
    if (lastTs > 0 && nowTs - lastTs < CLICK_DEDUP_WINDOW_MS) return false;
  }

  if (last && normType !== 'CLICK' && actionFingerprint(last) === actionFingerprint(action)) {
    return false;
  }

  actions.push(action);
  return true;
}

export function ingestAction(actions, rawAction) {
  const normalized = normalizeStoredAction(rawAction);
  if (!normalized) return { changed: false, actions };

  if (normalized.type === 'NAVIGATE') {
    const navResult = applyNavigateToActions(actions, normalized);
    return { changed: navResult !== 'skip', actions };
  }

  if (!mergeActionIntoList(actions, normalized)) {
    return { changed: false, actions };
  }
  return { changed: true, actions };
}

function stepTypeFromAction(type) {
  const map = {
    NAVIGATE: 'goto',
    CLICK: 'click',
    FILL: 'fill',
    SELECT: 'select',
    CHECK: 'check',
    UNCHECK: 'uncheck',
    ASSERT: 'assert',
    SLEEP: 'wait',
    LABEL: 'label',
    WAIT: 'waitFor',
    SCROLL: 'scroll',
    HOVER: 'hover',
  };
  return map[type] || String(type || '').toLowerCase();
}

function parseScrollPayload(action) {
  try {
    return typeof action.value === 'string' ? JSON.parse(action.value) : (action.value || {});
  } catch (_) {
    return {};
  }
}

function humanLabel(action) {
  const type = normalizeActionType(action.type);
  const sel = action.stableSelector || action.selector || '';
  if (type === 'NAVIGATE') return `打开 ${action.value || action.url || ''}`;
  if (type === 'FILL') return `输入「${String(action.value ?? '').slice(0, 40)}」`;
  if (type === 'CLICK') return `点击 ${action.ariaName || sel || '元素'}`;
  if (type === 'SELECT') return `选择 ${action.value ?? ''}`;
  if (type === 'CHECK') return `勾选 ${action.ariaName || sel}`;
  if (type === 'UNCHECK') return `取消勾选 ${action.ariaName || sel}`;
  if (type === 'HOVER') return `悬停 ${action.ariaName || sel || '元素'}`;
  if (type === 'WAIT') return `等待元素出现 ${sel || ''}`.trim();
  if (type === 'SCROLL') {
    const s = parseScrollPayload(action);
    const parts = [];
    if (s.deltaTop) parts.push(`↓${s.deltaTop}px`);
    if (s.deltaLeft) parts.push(`→${s.deltaLeft}px`);
    return `滚动 ${action.stableSelector || 'html'} ${parts.join(' ') || ''}`.trim();
  }
  if (type === 'ASSERT') return action.label || `断言 ${action.assertOperator || action.operator || 'visible'}`;
  if (type === 'SLEEP') return `等待 ${action.value || action.ms || 0}ms`;
  if (type === 'LABEL') return action.value || action.label || '备注';
  return action.label || type;
}

export function actionToStep(action) {
  const type = normalizeActionType(action.type);
  const stepType = stepTypeFromAction(type);
  const base = {
    id: action.id || `step-${action.recordedAt || Date.now()}`,
    type: stepType,
    stableSelector: action.stableSelector || '',
    selectorLabel: action.stableSelector || action.selector || '',
    locatorPlan: action.locatorPlan,
    ariaRole: action.ariaRole,
    ariaName: action.ariaName,
    frameChain: action.frameChain,
    inIframe: action.inIframe,
    opensNewTab: action.opensNewTab,
    afterClickUrl: action.afterClickUrl,
    matchCount: action.matchCount,
    label: humanLabel(action),
    timestamp: action.recordedAt || Date.now(),
  };

  if (type === 'NAVIGATE') {
    return { ...base, type: 'goto', url: action.value || action.url };
  }
  if (type === 'FILL' || type === 'SELECT') {
    return { ...base, value: action.value };
  }
  if (type === 'SLEEP') {
    return { ...base, type: 'wait', ms: Number(action.value || action.ms) || 1000 };
  }
  if (type === 'WAIT') {
    return { ...base, type: 'waitFor' };
  }
  if (type === 'HOVER') {
    return { ...base, type: 'hover' };
  }
  if (type === 'SCROLL') {
    const s = parseScrollPayload(action);
    return {
      ...base,
      type: 'scroll',
      scrollTarget: action.stableSelector || 'html',
      deltaTop: Number(s.deltaTop) || 0,
      deltaLeft: Number(s.deltaLeft) || 0,
      scrollTop: s.scrollTop,
      scrollLeft: s.scrollLeft,
    };
  }
  if (type === 'LABEL') {
    return { ...base, type: 'label', text: action.value || action.label || '' };
  }
  if (type === 'ASSERT') {
    return {
      ...base,
      type: 'assert',
      assertOperator: action.assertOperator || action.operator || 'visible',
      text: action.text || action.targetText || action.value,
    };
  }
  return base;
}

export function actionsToSteps(actions) {
  return (actions || []).map(actionToStep);
}

export function stepsToActions(steps) {
  return (steps || []).map((step) => {
    const type = String(step.type || '').toLowerCase();
    const map = {
      goto: 'NAVIGATE',
      click: 'CLICK',
      fill: 'FILL',
      select: 'SELECT',
      check: 'CHECK',
      uncheck: 'UNCHECK',
      assert: 'ASSERT',
      asserttext: 'ASSERT',
      wait: 'SLEEP',
      waitfor: 'WAIT',
      hover: 'HOVER',
      scroll: 'SCROLL',
      label: 'LABEL',
    };
    const actionType = map[type] || String(step.type || '').toUpperCase();
    const base = {
      id: step.id,
      type: actionType,
      stableSelector: step.stableSelector || step.selectorLabel || step.scrollTarget || '',
      selector: step.stableSelector || step.selectorLabel || step.scrollTarget || '',
      ariaRole: step.ariaRole,
      ariaName: step.ariaName,
      locatorPlan: step.locatorPlan,
      frameChain: step.frameChain,
      inIframe: step.inIframe,
      opensNewTab: step.opensNewTab,
      afterClickUrl: step.afterClickUrl,
      matchCount: step.matchCount,
      recordedAt: step.timestamp || Date.now(),
      label: step.label,
    };
    if (actionType === 'NAVIGATE') {
      return { ...base, value: step.url, url: step.url };
    }
    if (actionType === 'SLEEP') {
      return { ...base, value: step.ms, ms: step.ms };
    }
    if (actionType === 'SCROLL') {
      return {
        ...base,
        stableSelector: step.scrollTarget || step.stableSelector || 'html',
        selector: step.scrollTarget || step.stableSelector || 'html',
        value: JSON.stringify({
          deltaTop: step.deltaTop ?? 0,
          deltaLeft: step.deltaLeft ?? 0,
          scrollTop: step.scrollTop,
          scrollLeft: step.scrollLeft,
        }),
      };
    }
    if (actionType === 'LABEL') {
      return { ...base, value: step.text || step.label };
    }
    if (actionType === 'ASSERT') {
      return {
        ...base,
        assertOperator: step.assertOperator || 'visible',
        operator: step.assertOperator || 'visible',
        text: step.text,
        value: step.text,
      };
    }
    return { ...base, value: step.value };
  });
}
