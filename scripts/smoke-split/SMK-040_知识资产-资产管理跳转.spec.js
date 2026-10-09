// 知识基座冒烟 · SMK-040 知识资产-资产管理跳转
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-040 知识资产-资产管理跳转', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.source-table__name-cell');
    // 点击后在新标签页(popup)打开资产管理
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      teamRow(page).locator('.source-table__link', { hasText: '资产管理' }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('/asset/drive/3150461917/overview');
    await expect(popup.locator('text=资产概览').first()).toBeVisible();
    await expect(popup.locator('text=文档已解析').first()).toBeVisible();
    const bodyText = await popup.locator('body').innerText();
    expect(parseCount(bodyText, '文档已解析')).toBeGreaterThan(0);
    await popup.close();
  
});

