import { test, expect } from '@playwright/test';

/** 通用用例：国内网络友好的冒烟（需服务器能访问 baidu.com） */
test('百度搜索页可打开', async ({ page }) => {
  await page.goto('https://www.baidu.com/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#kw')).toBeVisible();
  await expect(page.locator('#su')).toBeVisible();
});
