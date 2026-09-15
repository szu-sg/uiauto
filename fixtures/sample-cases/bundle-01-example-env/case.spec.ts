import { test, expect } from '@playwright/test';

/**
 * 绑定包用例（bundle）：随 ZIP 导入 environment.json 快照。
 * 执行时使用用例自带环境（base_url 指向 example.com）。
 */
test('通过环境 base_url 打开首页', async ({ page }) => {
  const base = process.env.BASE_URL || 'https://example.com';
  const url = base.endsWith('/') ? base : `${base}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Example Domain/i);
});
