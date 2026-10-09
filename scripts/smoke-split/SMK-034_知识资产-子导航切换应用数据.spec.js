// 知识基座冒烟 · SMK-034 知识资产-子导航切换应用数据
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-034 知识资产-子导航切换应用数据', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.resource-page__tab');
    await page.locator('.resource-page__tab', { hasText: '应用数据' }).click();
    await waitDataReady(page, 'text=我的使用数据');
    // 应用数据内容渲染：标题 + 应用列表
    await expect(page.locator('text=我的使用数据').first()).toBeVisible();
    await expect(page.locator('text=应用列表').first()).toBeVisible();
    // 应用列表应有数据行（「查看数据」是链接 <a>，不是 button）
    const viewLinks = page.locator('text=查看数据');
    const appCount = await viewLinks.count();
    expect(appCount, `应用列表应有数据行，实际: ${appCount}`).toBeGreaterThanOrEqual(1);
    // 点击「查看数据」链接，校验跳转到应用数据详情页
    const prevUrl = page.url();
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
      viewLinks.first().click(),
    ]);
    if (newPage) {
      await newPage.close();
    } else {
      await page.waitForURL(url => url !== prevUrl, { timeout: 8000 }).catch(() => {});
    }
    expect(page.url()).not.toBe(prevUrl);
  
});

