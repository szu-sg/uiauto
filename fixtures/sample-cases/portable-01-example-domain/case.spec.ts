import { test, expect } from '@playwright/test';

/**
 * 通用用例（portable）：不依赖平台环境 base_url，使用绝对 URL。
 * 适合：导入后绑定到「任意计划环境」试跑 / 计划执行。
 */
test('Example Domain 页面标题正确', async ({ page }) => {
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Example Domain/i);
  await expect(page.locator('h1')).toContainText('Example Domain');
});
