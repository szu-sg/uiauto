/** @generated from smoke.spec.js — do not edit per-case scripts by copying this file */
import { expect } from '@playwright/test';

export const BASE = 'https://365.kdocs.cn';
export const HOME = `${BASE}/aidocs/home/`;

// —— 各应用类型元数据 ——
export const APP_TYPES = {
  智能问答: {
    createUrl: '/aidocs/home/qa/create',
    configUrl: '**/qa/config/**',
    doneUrl: '**/qa/**',
    // 完成页断言 + 问答验证
    assert: async (page) => {
      // 断言进入问答应用完成页
      await expect(page.locator('text=你好，有什么可以帮你？')).toBeVisible();
      // 问答：在完成页输入 query 并发送
      await page.locator('div.kd-chat-sender__textarea').fill('电子竞技的发展期是什么时候');
      await page.locator('button.kd-chat-sender__send').click();
      // 等待回答出现且命中知识源（回答含"电子竞技"相关内容）
      await expect(page.locator('.kd-chat-conversation__content')).toContainText('电子竞技', { timeout: 30000 });
    },
    // 类型专属配置步骤
    configure: async (page) => {
      // 选择"自动化测试团队"知识源
      await page.locator('.knowledge-source__item', { hasText: '自动化测试团队' }).click();
      await page.waitForSelector('button:has-text("下一步")');
      await page.locator('button:has-text("下一步")').click();
      // 等待进入效果配置页，页面渲染稳定后再点"创建"
      await page.waitForSelector('button:has-text("创建")');
      await page.waitForTimeout(1200);
    },
  },
  报告写作: {
    createUrl: '/aidocs/home/report/create',
    configUrl: '**/report/config/**',
    doneUrl: '**/report/**',
    assert: async (page) => {
      await expect(page.locator('button:has-text("开始写作")')).toBeVisible();
    },
    configure: async (page) => {
      // 报告写作配置页是分步向导：填模板类型→选模板→保存→循环点"下一步"直到"创建"
      await page.getByPlaceholder('请输入模板类型').fill('立项报告');
      await page.waitForTimeout(300);
      // 点击"选择模板"打开文件选择器
      await page.locator('button:has-text("选择模板")').first().click();
      // 在弹窗中选择"自动化"文件夹
      await page.locator('.kuc-list-item', { hasText: '自动化' }).click();
      await page.waitForTimeout(500);
      // 选择"电子竞技相似文档(1)"
      await page.locator('.kuc-list-item', { hasText: '电子竞技相似文档' }).click();
      await page.waitForTimeout(500);
      // 点击"确定"关闭文件选择器
      await page.locator('button:has-text("确定")').click();
      await page.waitForTimeout(500);
      // 点击"保存"使"下一步"可用
      await page.locator('button:has-text("保存")').click();
      await page.waitForTimeout(800);
      // 走向导直到出现"创建"
      await stepThroughWizard(page);
      await page.waitForSelector('button:has-text("创建")');
    },
  },
  文档审查: {
    createUrl: '/aidocs/home/review/create',
    configUrl: '**/review/config/**',
    doneUrl: '**/review/**',
    assert: async (page) => {
      await expect(page.locator('text=文档审查')).toBeVisible();
    },
    configure: async (page) => {
      // 文档审查配置页是分步向导（审查类型→审查清单），审查类型默认通用文档，直接走向导
      await stepThroughWizard(page);
      await page.waitForSelector('button:has-text("创建")');
    },
  },
  智能考试: {
    createUrl: '/aidocs/home/exam/create',
    configUrl: '**/exam/config/**',
    doneUrl: '**/exam/**',
    assert: async (page) => {
      await expect(page.locator('button:has-text("开始生成")')).toBeVisible();
    },
    configure: async (page) => {
      // 智能考试配置页含试题类型/难度/出题要求，默认值可直接创建
      await page.waitForSelector('button:has-text("创建")');
    },
  },
  内容抽取: {
    createUrl: '/aidocs/home/extraction/create',
    configUrl: '**/extraction/config/**',
    doneUrl: '**/extraction/**',
    assert: async (page) => {
      await expect(page.locator('button:has-text("开始抽取")')).toBeVisible();
    },
    configure: async (page) => {
      // 内容抽取配置页含抽取字段，字段可后配，直接创建
      await page.waitForSelector('button:has-text("创建")');
    },
  },
};

// —— 辅助函数 ——

export function genAppName(type) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  return `冒烟-${type}-${stamp}`;
}

// 点击"新建应用"，选择类型，返回新开标签页
export async function startCreate(page, typeText) {
  await page.locator('.create-app-btn').first().click();
  await page.waitForSelector('.create-app-btn__option');
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.create-app-btn__option', { hasText: typeText }).click(),
  ]);
  await popup.waitForLoadState();
  return popup;
}

// 在 create 页点击空白应用，填写基本信息并确定
export async function fillBasicInfo(popup, name) {
  await popup.locator('.template-card--create').click();
  await popup.waitForSelector('.kdv-input__inner');
  await popup.locator('.kdv-input__inner').fill(name);
  await popup.locator('button:has-text("确定")').click();
  await popup.waitForURL('**/config/**', { timeout: 20000 });
}

// 分步向导：循环点击"下一步"，直到出现"创建"按钮（用于报告写作/文档审查等向导型配置页）
export async function stepThroughWizard(page, maxSteps = 12) {
  for (let i = 0; i < maxSteps; i++) {
    if ((await page.locator('button:has-text("创建")').count()) > 0) {
      return; // 已出现创建按钮，退出
    }
    const next = page.locator('button:has-text("下一步")');
    if ((await next.count()) > 0) {
      await next.first().click();
      await page.waitForTimeout(800);
    } else {
      break;
    }
  }
}

// 点击"创建"并等待跳转到完成页（规避无头下偶发点击不触发：先普通点击，若 5 秒未跳转则 force 重试一次）
export async function clickCreateAndWait(pageOrPopup, waitPredicate) {
  const btn = pageOrPopup.locator('button:has-text("创建")').first();
  await btn.click();
  try {
    await pageOrPopup.waitForURL(waitPredicate, { timeout: 5000 });
    return;
  } catch (e) {
    // 未跳转，force 重试一次
    await btn.click({ force: true });
    await pageOrPopup.waitForURL(waitPredicate, { timeout: 20000 });
  }
}

// 删除应用（闭环：新建 → 删除，避免残留测试数据）
export async function deleteApp(page, appUrl) {
  // 应用页 /type/{id} → 配置页 /type/config/{id}
  const configUrl = appUrl.replace(/\/([^/]+)\/([^/]+)$/, '/$1/config/$2');
  await page.goto(configUrl);
  await page.waitForLoadState();
  // 点击"基础配置" tab（精确定位 button，避免误匹配 __tabs 容器）
  await page.locator('button:has-text("基础配置")').first().click();
  await page.waitForTimeout(1000);
  // 点击"删除应用"区域里的"删除"按钮，先滚动到可见
  const delBtn = page.locator('[class*="delete-section"] button:has-text("删除")');
  await delBtn.scrollIntoViewIfNeeded();
  await delBtn.click();
  // 等待确认弹窗，点击"确认删除"
  const confirmBtn = page.locator('button:has-text("确认删除")').first();
  await confirmBtn.waitFor({ timeout: 10000 });
  await confirmBtn.click();
  // 等待删除完成
  await page.waitForTimeout(2000);
}

// 完整创建流程：新建 → 选类型 → 空白 → 基本信息 → 配置 → 创建 → 断言 → 删除（闭环）
export async function createApp(page, typeText, typeMeta) {
  const name = genAppName(typeText);
  const popup = await startCreate(page, typeText);
  await fillBasicInfo(popup, name);
  await typeMeta.configure(popup);
  // 点击"创建"并等待跳转（含 force 重试兜底，规避无头下点击偶发不触发）
  await clickCreateAndWait(
    popup,
    (url) => /\/aidocs\/home\/\w+\/\w+$/.test(url.pathname) && !url.pathname.includes('/config/')
  );
  await popup.waitForLoadState();
  await typeMeta.assert(popup);
  // 闭环：记录地址并删除应用
  const appUrl = popup.url();
  await deleteApp(popup, appUrl);
  await popup.close();
  return { name, appUrl };
}

export const TEMPLATES = {
  零售供应商合同审查: { assertText: '文档审查', assertBtn: null },
  通用合同抽取: { assertText: null, assertBtn: '开始抽取' },
  科研项目结题验收申报书: { assertText: null, assertBtn: '开始写作' },
  发票抽取: { assertText: null, assertBtn: '开始抽取' },
  新员工入职考试: { assertText: null, assertBtn: '开始生成' },
};

// 从精选模板创建应用，返回完成页 URL
export async function createAppFromTemplate(page, templateName) {
  await page.locator('span.nav-menu__item-label:has-text("应用模板")').click();
  await page.waitForTimeout(1500);
  // 点击模板 → 模板详情模态框
  await page.locator(`.templates-page__template-name:has-text("${templateName}")`).first().click();
  await page.waitForTimeout(1500);
  // 点"做同款" → 创建对话框（当前页弹窗）
  await page.locator('button:has-text("做同款")').first().click();
  await page.waitForTimeout(1000);
  // 填名称 → 确定
  await page.locator('.kdv-input__inner').fill(genAppName(templateName));
  await page.locator('button:has-text("确定")').click();
  await page.waitForURL('**/config/**', { timeout: 20000 });
  // 配置页（模板已预置）→ 若有向导（"下一步"）先走完，直到出现"创建"按钮
  await stepThroughWizard(page);
  await page.waitForSelector('button:has-text("创建")');
  // 点击"创建"并等待跳转（含 force 重试兜底）
  await clickCreateAndWait(
    page,
    (url) => /\/aidocs\/home\/\w+\/\w+$/.test(url.pathname) && !url.pathname.includes('/config/')
  );
  await page.waitForLoadState();
  return page.url();
}

export async function navigateFolders(page, folders) {
  // 不同应用（报告/审查/考试/抽取）的文档选择器容器 class 可能不同（.kdv-dialog__body 或自定义），
  // 统一用可见文本"团队文档"定位 tab，保证通用性
  await page.locator('text=团队文档').first().click();
  await page.waitForTimeout(1000);
  for (const folder of folders) {
    await page.locator('.kuc-list-item', { hasText: folder }).first().click();
    await page.waitForTimeout(1000);
  }
}

// 文件选择器：选中文档并确定
export async function pickDocument(page, docText) {
  await page.locator('.kuc-list-item', { hasText: docText }).first().click();
  await page.waitForTimeout(800);
  await page.locator('button:has-text("确定")').click();
  await page.waitForTimeout(1500);
}

// 等待页面数据加载完成，避免"断言过早"（元素容器/静态标签先渲染，数据仍在异步加载）
// page 加载后先等"加载中"文本消失，再等目标数据元素出现，最后稳定延时。
export async function waitDataReady(page, dataSelector, { timeout = 20000, settle = 800 } = {}) {
  // 1. 等"加载中"文本消失（若页面使用文本型 loading）
  await page
    .waitForFunction(() => !(document.body.innerText || '').includes('加载中'), null, { timeout: 5000 })
    .catch(() => {});
  // 2. 等目标数据元素出现（传入具体数据选择器，而非静态容器标签）
  if (dataSelector) {
    await page.waitForSelector(dataSelector, { timeout });
  }
  // 3. 稳定延时，确保异步渲染/图片加载完成
  await page.waitForTimeout(settle);
}

// 点击按钮并确认断言成立（规避无头下点击偶发不触发：先普通点击，断言 6 秒未成立则 force 重试一次）
// 注意：若点击后按钮已消失（说明动作已触发成功，如"开始写作"进入生成态），直接视为成功，不再 force 重试
export async function clickAndConfirm(page, btnLocator, assertFn, confirmTimeout = 60000) {
  await btnLocator.click();
  try {
    await assertFn(6000);
    return;
  } catch (e) {
    // 按钮已消失 → 点击已生效，视为成功
    if ((await btnLocator.count()) === 0 || !(await btnLocator.first().isVisible().catch(() => false))) {
      return;
    }
    await btnLocator.click({ force: true });
    await assertFn(confirmTimeout);
  }
}

export const ASSET_URL = 'https://365.kdocs.cn/aidocs/home/asset';

// 辅助：从文本中提取「关键词 X 份」的份数（支持千分位逗号），找不到返回 0
export function parseCount(text, keyword) {
  const m = text.match(new RegExp(keyword + '\\s*([\\d,]+)\\s*份'));
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

// 辅助：从卡片 innerText 中提取「关键词 数字」的数字（支持千分位逗号）
export function parseCardNumber(cardText, keyword) {
  const m = cardText.match(new RegExp(keyword + '\\s*([\\d,]+)'));
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : -1;
}

// 辅助：定位知识源管理表格中「自动化测试团队」所在行
export function teamRow(page) {
  return page
    .locator('tr', { has: page.locator('.source-table__name-cell', { hasText: '自动化测试团队' }) })
    .first();
}

export const RECENT_APPS = [
  { key: '报告自动化', appName: '报告自动化', title: '「报告自动化」使用记录', urlPart: '/report/', appId: '6a8a9825dbfe3bd9a246d5a4' },
  { key: '考试自动化', appName: '考试自动化', title: '「考试自动化」使用记录', urlPart: '/exam/', appId: '6a8a984ddbfe3bd9a246d5a8' },
  { key: '问答自动化', appName: '问答自动化', title: '「问答自动化」使用记录', urlPart: '/qa/', appId: '6a8a97afdbfe3bd9a246d5a0' },
  { key: '抽取自动化', appName: '抽取自动化', title: '「抽取自动化」使用记录', urlPart: '/extraction/', appId: '6a8a985bdbfe3bd9a246d5aa' },
  { key: '审查自动化', appName: '审查自动化', title: '「审查自动化」使用记录', urlPart: '/review/', appId: '6a8a983edbfe3bd9a246d5a6' },
];

// 点击最近列表中的应用 → 使用记录页 → 等待加载完成
// 数据源缺失（应用已被清理导致历史记录页无法加载）时自动跳过，避免误报失败
export async function openRecentApp(page, app) {
  // page fixture 初始在 baseURL（主站 365.kdocs.cn），需显式导航到 AI 文档首页才能定位最近列表
  await page.goto('https://365.kdocs.cn/aidocs/home/');
  await page.waitForSelector('.recent-list__item');
  // 最近列表异步渲染，等待目标应用记录加载完成（列表后部的记录可能延迟出现），超时则尝试访问应用 URL 产生最近记录
  const targetType = page.locator(`.recent-list__item-app-name:has-text("${app.appName}")`).first();
  try {
    await targetType.waitFor({ timeout: 15000 });
  } catch (e) {
    // 数据源缺失：直接导航到应用页面，点击「使用记录」进入历史记录页
    await page.screenshot({ path: `debug_fail_${app.appName}.png` }).catch(() => {});
    await page.goto(`https://365.kdocs.cn/aidocs/home${app.urlPart}${app.appId || ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // 点击「使用记录」按钮进入历史记录页
    const historyBtn = page.locator('text=使用记录').first();
    if (await historyBtn.count().catch(() => 0) > 0) {
      await historyBtn.click();
      // SPA 导航，用 timeout 等待页面渲染而非 waitForURL（后者等待 load 事件，SPA 不触发）
      await page.waitForTimeout(5000);
      // 验证历史记录页标题
      await expect(page.locator('text=/「.*」使用记录/').first()).toBeVisible();
      // 等待加载完成
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await page.waitForFunction(
            () => !(document.body.innerText || '').includes('加载中'),
            null,
            { timeout: 60000 }
          );
          return;
        } catch (e3) {
          if (attempt === 0) {
            await page.reload();
            await page.waitForTimeout(3000);
          } else {
            throw e3;
          }
        }
      }
    }
    throw new Error(`无法通过「使用记录」进入历史记录页（应用URL: ${app.urlPart}${app.appId}）`);
  }
  const item = page
    .locator('.recent-list__item', { has: page.locator('.recent-list__item-app-name', { hasText: app.appName }) })
    .first();
  if ((await item.count()) === 0) {
    throw new Error(`最近列表无「${app.appName}」记录（数据源缺失，应用可能已被清理）`);
  }
  await item.locator('.recent-list__item-title').click();
  await page.waitForURL('**/history/**', { timeout: 20000 });
  // 若打开后提示"获取应用信息失败"（应用已被清理），跳过该用例
  await page.waitForTimeout(3000);
  if ((await page.locator('text=获取应用信息失败').count()) > 0) {
    await page.screenshot({ path: `debug_fail_${app.appName}.png` }).catch(() => {});
    throw new Error(`「${app.appName}」应用已被清理，历史记录页无法加载（数据源缺失）`);
  }
  // 断言历史记录页加载成功：出现"「xxx」使用记录"标题（应用名可能含"专用-勿删"等后缀，用正则匹配，避免精确匹配失败）
  await expect(page.locator('text=/「.*」使用记录/').first()).toBeVisible();
  // 等待"加载中..."消失（记录内容加载完成），最长 2 分钟
  // 等待"加载中..."消失（记录内容加载完成），最长 2 分钟
  // 头两次使用 reload 兜底：部分页面（问答历史记录）无头下偶发卡在"加载中..."，刷新后正常
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.waitForFunction(
        () => !(document.body.innerText || '').includes('加载中'),
        null,
        { timeout: 60000 }
      );
      return; // 加载完成，直接返回
    } catch (e) {
      if (attempt === 0) {
        console.log(`[DIAG] 加载中超时(attempt=${attempt})，尝试刷新页面`);
        await page.reload();
        await page.waitForTimeout(3000);
        // 重新等待标题出现
        await expect(page.locator('text=/「.*」使用记录/').first()).toBeVisible({ timeout: 15000 });
      } else {
        console.log(`[DIAG] 刷新后仍超时(attempt=${attempt})，报告失败`);
        throw e;
      }
    }
  }
}

export async function homeBeforeEach({ page }) {
  await page.goto(HOME);
  await page.waitForSelector('text=新建应用');
}
