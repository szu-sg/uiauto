// 知识基座冒烟 · SMK-005 知识资产 → 首页
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-005 知识资产 → 首页', async ({ page }) => {
    await page.locator('span.nav-menu__item-label', { hasText: '首页' }).click();
    // 等应用卡片数据加载完成
    await waitDataReady(page, '.app-card__title');
    await expect(page.locator('text=我的应用')).toBeVisible();
  
});

