// 知识基座冒烟 · SMK-041 知识资产-设置弹出AI服务管理面板
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-041 知识资产-设置弹出AI服务管理面板', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.resource-page__tab');
    await page.locator('button:has-text("设置")').first().click();
    // 弹出「AI 服务管理」面板，且面板内可见「自动化测试团队」
    const dialog = page.locator('[class*="dialog"], [class*="drawer"]').filter({ hasText: 'AI 服务管理' }).first();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=自动化测试团队').first()).toBeVisible();
  
});

