// 知识基座冒烟 · SMK-016 新建应用-取消关闭面板
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-016 新建应用-取消关闭面板', async ({ page }) => {
    await page.locator('.create-app-btn').first().click();
    await page.waitForSelector('.create-app-btn__option');
    // 断言面板已打开
    await expect(page.locator('text=选择应用类型')).toBeVisible();
    // 按 Escape 关闭面板
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // 断言面板已关闭
    await expect(page.locator('text=选择应用类型')).not.toBeVisible();
  
});

