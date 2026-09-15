/** 将录制步骤 JSON 生成为 Playwright 脚本（TS / JS / Python） */

function escapeJs(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapePy(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function locatorExpr(step) {
  const stable = String(step.stableSelector || step.selectorLabel || step.scrollTarget || '').trim();
  if (stable) {
    const expr = stable.startsWith('page.') ? stable.slice(5) : stable;
    return expr;
  }
  return "locator('body')";
}

function framePrefix(step) {
  const chain = step.frameChain;
  if (!Array.isArray(chain) || !chain.length) return 'page';
  let expr = 'page';
  for (const frameSel of chain) {
    expr += `.frameLocator('${escapeJs(frameSel)}')`;
  }
  return expr;
}

function targetLocator(step) {
  const loc = locatorExpr(step);
  const prefix = framePrefix(step);
  if (prefix === 'page') return `page.${loc}`;
  return `${prefix}.${loc}`;
}

function iframeWaitTs(step, indent) {
  if (!Array.isArray(step.frameChain) || !step.frameChain.length) return '';
  return `${indent}await page.locator('iframe').first().waitFor({ state: 'attached', timeout: 15000 });\n`;
}

function stepToCodeTs(step, idx, meta) {
  const n = idx + 1;
  const comment = step.label || step.type;
  const type = String(step.type || '').toLowerCase();
  const indent = '  ';

  switch (type) {
    case 'goto': {
      let code = `${indent}// ${n}. ${comment}\n${indent}await page.goto('${escapeJs(step.url)}');`;
      if (meta.autoAssertions) {
        code += `\n${indent}await expect(page).toHaveURL('${escapeJs(step.url)}');`;
      }
      return code;
    }
    case 'click': {
      let code = `${indent}// ${n}. ${comment}\n${iframeWaitTs(step, indent)}${indent}await ${targetLocator(step)}.click();`;
      if (step.afterClickUrl || step.opensNewTab) {
        code += `\n${indent}// 新标签页场景请手动补充: const page1 = await context.waitForEvent('page');`;
      }
      return code;
    }
    case 'fill':
      return `${indent}// ${n}. ${comment}\n${iframeWaitTs(step, indent)}${indent}await ${targetLocator(step)}.fill('${escapeJs(step.value)}');`;
    case 'select':
      return `${indent}// ${n}. ${comment}\n${iframeWaitTs(step, indent)}${indent}await ${targetLocator(step)}.selectOption('${escapeJs(step.value)}');`;
    case 'check':
      return `${indent}// ${n}. ${comment}\n${indent}await ${targetLocator(step)}.check();`;
    case 'uncheck':
      return `${indent}// ${n}. ${comment}\n${indent}await ${targetLocator(step)}.uncheck();`;
    case 'hover':
      return `${indent}// ${n}. ${comment}\n${indent}await ${targetLocator(step)}.hover();`;
    case 'waitfor':
      return `${indent}// ${n}. ${comment}\n${indent}await ${targetLocator(step)}.waitFor({ state: 'visible', timeout: 30000 });`;
    case 'scroll': {
      const target = step.scrollTarget || 'html';
      const dy = Number(step.deltaTop) || 0;
      const dx = Number(step.deltaLeft) || 0;
      if (target === 'html' || target === 'page') {
        return `${indent}// ${n}. ${comment}\n${indent}await page.evaluate(({ dx, dy }) => window.scrollBy({ left: dx, top: dy }), { dx: ${dx}, dy: ${dy} });`;
      }
      return `${indent}// ${n}. ${comment}\n${indent}await ${targetLocator(step)}.scrollIntoViewIfNeeded();\n${indent}await ${targetLocator(step)}.evaluate((el, p) => el.scrollBy({ left: p.dx, top: p.dy }), { dx: ${dx}, dy: ${dy} });`;
    }
    case 'assert': {
      const op = step.assertOperator || 'visible';
      const loc = targetLocator(step);
      if (op === 'attached') return `${indent}// ${n}. ${comment}\n${indent}await expect(${loc}).toBeAttached();`;
      if (op === 'hidden') return `${indent}// ${n}. ${comment}\n${indent}await expect(${loc}).toBeHidden();`;
      if (op === 'eq' && step.text) return `${indent}// ${n}. ${comment}\n${indent}await expect(${loc}).toHaveText('${escapeJs(step.text)}');`;
      if (op === 'contains' && step.text) return `${indent}// ${n}. ${comment}\n${indent}await expect(${loc}).toContainText('${escapeJs(step.text)}');`;
      return `${indent}// ${n}. ${comment}\n${indent}await expect(${loc}).toBeVisible();`;
    }
    case 'wait':
      return `${indent}// ${n}. ${comment}\n${indent}await page.waitForTimeout(${Number(step.ms || step.value) || 1000});`;
    case 'label':
      return `${indent}// ${n}. ${step.text || step.label || '备注'}`;
    default:
      return `${indent}// ${n}. ${comment}`;
  }
}

function stepToCodePy(step, idx, meta) {
  const n = idx + 1;
  const comment = step.label || step.type;
  const type = String(step.type || '').toLowerCase();
  const i = '        ';

  switch (type) {
    case 'goto': {
      let code = `${i}# ${n}. ${comment}\n${i}await page.goto("${escapePy(step.url)}", wait_until="domcontentloaded")\n`;
      if (meta.autoAssertions) code += `${i}await expect(page).to_have_url("${escapePy(step.url)}")\n`;
      return code.trimEnd();
    }
    case 'click':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.click()`;
    case 'fill':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.fill("${escapePy(step.value)}")`;
    case 'select':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.select_option("${escapePy(step.value)}")`;
    case 'check':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.check()`;
    case 'uncheck':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.uncheck()`;
    case 'hover':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.hover()`;
    case 'waitfor':
      return `${i}# ${n}. ${comment}\n${i}await page.${locatorExpr(step)}.wait_for(state="visible", timeout=30000)`;
    case 'wait':
      return `${i}# ${n}. ${comment}\n${i}await page.wait_for_timeout(${Number(step.ms) || 1000})`;
    case 'assert': {
      const op = step.assertOperator || 'visible';
      const loc = `page.${locatorExpr(step)}`;
      if (op === 'hidden') return `${i}# ${n}. ${comment}\n${i}await expect(${loc}).to_be_hidden()`;
      if (op === 'eq' && step.text) return `${i}# ${n}. ${comment}\n${i}await expect(${loc}).to_have_text("${escapePy(step.text)}")`;
      if (op === 'contains' && step.text) return `${i}# ${n}. ${comment}\n${i}await expect(${loc}).to_contain_text("${escapePy(step.text)}")`;
      return `${i}# ${n}. ${comment}\n${i}await expect(${loc}).to_be_visible()`;
    }
    case 'label':
      return `${i}# ── ${step.text || step.label || '备注'} ──`;
    default:
      return `${i}# ${n}. ${comment}`;
  }
}

function viewportSetupLineTs(meta) {
  const width = meta.device?.width ?? 1280;
  const height = meta.device?.height ?? 720;
  const custom = meta.device && (width !== 1280 || height !== 720);
  if (!custom) return '';
  return `  await page.setViewportSize({ width: ${width}, height: ${height} });\n\n`;
}

function wrapTs(steps, meta) {
  const name = escapeJs(meta.name?.trim() || 'recorded test');
  const viewportLine = viewportSetupLineTs(meta);
  const body = (steps || []).map((s, i) => stepToCodeTs(s, i, meta)).join('\n\n');
  return `import { test, expect } from '@playwright/test';

test('${name}', async ({ page }) => {
${viewportLine}${body || '  // 暂无录制步骤'}
});
`;
}

function wrapJs(steps, meta) {
  const name = escapeJs(meta.name?.trim() || 'recorded test');
  const viewportLine = viewportSetupLineTs(meta);
  const body = (steps || []).map((s, i) => stepToCodeTs(s, i, meta)).join('\n\n');
  return `const { test, expect } = require('@playwright/test');

test('${name}', async ({ page }) => {
${viewportLine}${body || '  // 暂无录制步骤'}
});
`;
}

function wrapPy(steps, meta) {
  const width = meta.device?.width || 1280;
  const height = meta.device?.height || 720;
  const body = (steps || []).map((s, i) => stepToCodePy(s, i, meta)).join('\n\n');
  return `import re
from playwright.sync_api import Page, expect


def test_recorded(page: Page) -> None:
    page.set_viewport_size({"width": ${width}, "height": ${height}})

${body || '        # 暂无录制步骤'}
`;
}

export function generatePlaywrightScript(steps, meta = {}) {
  return generateScript(steps, { ...meta, language: meta.language || 'typescript' });
}

export function generateScript(steps, meta = {}) {
  const lang = meta.language || 'typescript';
  if (lang === 'javascript') return wrapJs(steps, meta);
  if (lang === 'python') return wrapPy(steps, meta);
  return wrapTs(steps, meta);
}

export function scriptExtension(language = 'typescript') {
  if (language === 'javascript') return 'spec.js';
  if (language === 'python') return 'test.py';
  return 'spec.ts';
}

export function slugifyCaseName(name) {
  const base = String(name || 'case')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || `case_${Date.now()}`;
}

const ESSENTIAL_COOKIE_NAMES = new Set(['wps_sid', 'wps_sids']);

/** 与保存用例时 .auth.json 一致，仅导出核心 Cookie */
export function filterStorageStateForExport(storageState) {
  if (!storageState || typeof storageState !== 'object') return null;
  const cookies = (Array.isArray(storageState.cookies) ? storageState.cookies : [])
    .filter((c) => c?.name && ESSENTIAL_COOKIE_NAMES.has(String(c.name).toLowerCase()));
  if (!cookies.length) return null;
  return { cookies, origins: [] };
}

export function authSidecarName(scriptFilename) {
  const dot = scriptFilename.lastIndexOf('.');
  const base = dot > 0 ? scriptFilename.slice(0, dot) : scriptFilename;
  return `${base}.auth.json`;
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadScript(filename, content) {
  triggerDownload(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }));
}

export function downloadJsonFile(filename, data) {
  triggerDownload(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
  );
}

/** 导出脚本及同名 .auth.json（Playwright storageState） */
export function exportRecordedCase({ slug, language, script, storageState }) {
  const scriptFilename = `${slug}.${scriptExtension(language)}`;
  downloadScript(scriptFilename, script);
  const auth = filterStorageStateForExport(storageState);
  if (!auth) return { scriptExported: true, authExported: false };
  window.setTimeout(() => downloadJsonFile(authSidecarName(scriptFilename), auth), 200);
  return { scriptExported: true, authExported: true };
}
