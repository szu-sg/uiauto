// 知识基座冒烟 · SMK-039 知识资产-文档管理跳转
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-039 知识资产-文档管理跳转', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.source-table__name-cell');
    // 点击后在新标签页(popup)打开文档管理
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      teamRow(page).locator('.source-table__link', { hasText: '文档管理' }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('www.kdocs.cn/ent/685989911/3150461917');
    await popup.close();
  
});

