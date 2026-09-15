import { test, expect } from '@playwright/test';

/** 通用用例：访问 Playwright 官网，验证页面可打开 */
test('Playwright 官网可访问', async ({ page }) => {
  await page.goto('https://playwright.dev/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Playwright/i);
  await expect(page.getByRole('link', { name: /Get started/i }).first()).toBeVisible();
});
