// 知识基座冒烟 · SMK-004 应用模板 → 知识资产
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-004 应用模板 → 知识资产', async ({ page }) => {
    await page.locator('span.nav-menu__item-label', { hasText: '知识资产' }).click();
    // 等知识源表格数据加载完成（避免仅断言"知识源管理"标签、数据仍加载中）
    await waitDataReady(page, '.source-table__name-cell');
    await expect(page.locator('text=知识源管理')).toBeVisible();
  
});

