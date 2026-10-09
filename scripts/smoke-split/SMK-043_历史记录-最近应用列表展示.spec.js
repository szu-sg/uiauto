// 知识基座冒烟 · SMK-043 历史记录-最近应用列表展示
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-043 历史记录-最近应用列表展示', async ({ page }) => {
    await page.waitForSelector('.recent-list__item');
    await expect(page.locator('.recent-list__header', { hasText: '最近' })).toBeVisible();
    const count = await page.locator('.recent-list__item').count();
    expect(count).toBeGreaterThanOrEqual(1);
    // 首条含名称、类型、时间
    await expect(page.locator('.recent-list__item-title').first()).toBeVisible();
    await expect(page.locator('.recent-list__item-app-name').first()).toBeVisible();
    await expect(page.locator('.recent-list__item-time').first()).toBeVisible();
  
});

