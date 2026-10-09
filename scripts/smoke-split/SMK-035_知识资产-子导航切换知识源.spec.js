// 知识基座冒烟 · SMK-035 知识资产-子导航切换知识源
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-035 知识资产-子导航切换知识源', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.resource-page__tab');
    await page.locator('.resource-page__tab', { hasText: '应用数据' }).click();
    await page.waitForTimeout(800);
    await page.locator('.resource-page__tab', { hasText: '知识源' }).click();
    await waitDataReady(page, '.source-table__name-cell');
    await expect(page.locator('text=知识源管理').first()).toBeVisible();
    await expect(page.locator('text=文档已解析').first()).toBeVisible();
  
});

