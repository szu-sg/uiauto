import { actionsToSteps } from '../services/recorderPipeline.js';
import { inferActionFromScript } from './inferActionFromScript.js';

function isRecordedAction(item) {
  if (!item || typeof item !== 'object') return false;
  const t = String(item.type || '').toUpperCase();
  return ['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'CHECK', 'UNCHECK', 'HOVER', 'SCROLL', 'ASSERT', 'SLEEP', 'LABEL', 'WAIT'].includes(t);
}

function isRecorderStep(item) {
  if (!item || typeof item !== 'object') return false;
  const t = String(item.type || '').toLowerCase();
  return ['goto', 'click', 'fill', 'select', 'check', 'uncheck', 'hover', 'scroll', 'assert', 'wait', 'label'].includes(t);
}

/** 解析表格「操作」列：Playwright 录制 steps / actions JSON */
export function parseRecordedStepsField(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  if (!s.startsWith('[')) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr) || !arr.length) return [];
    if (isRecordedAction(arr[0])) return actionsToSteps(arr);
    if (isRecorderStep(arr[0])) {
      return arr.map((step, i) => ({
        ...step,
        id: step.id || `step-import-${i}`,
        timestamp: step.timestamp || Date.now() + i,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/** 从脚本反推 steps（无录制 JSON 时的兜底，生成 label 步骤供编辑页展示） */
export function inferStepsFromScript(script) {
  const text = inferActionFromScript(script);
  if (!text) return [];
  const now = Date.now();
  return text.split('\n').map((line, i) => {
    const label = line.replace(/^\d+\.\s*/, '').trim();
    return {
      id: `step-infer-${now}-${i}`,
      type: 'label',
      label,
      text: label,
      timestamp: now + i,
    };
  });
}

/** 合并导入步骤：显式 steps > 操作列 JSON > 脚本推断 */
export function resolveImportSteps({ actionRaw, script, steps } = {}) {
  if (Array.isArray(steps) && steps.length) return steps;
  const fromField = parseRecordedStepsField(actionRaw);
  if (fromField.length) return fromField;
  return inferStepsFromScript(script);
}
