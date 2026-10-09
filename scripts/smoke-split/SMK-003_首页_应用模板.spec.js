// 知识基座冒烟 · SMK-003 首页 → 应用模板
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-003 首页 → 应用模板', async ({ page }) => {
    await page.locator('span.nav-menu__item-label', { hasText: '应用模板' }).click();
    // 等模板卡片数据加载完成（避免仅断言"精选模板"静态标签、卡片仍骨架加载中）
    await waitDataReady(page, '.templates-page__template-name');
    await expect(page.locator('text=精选模板')).toBeVisible();
    await expect(page.locator('text=全部模板')).toBeVisible();
    await expect(page.locator('.templates-page__template-name').first()).toBeVisible();
  
});

