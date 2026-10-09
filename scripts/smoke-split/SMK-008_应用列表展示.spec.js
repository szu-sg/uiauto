// 知识基座冒烟 · SMK-008 应用列表展示
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-008 应用列表展示', async ({ page }) => {
    await expect(page.locator('text=我的应用')).toBeVisible();
    // 筛选标签存在（全部/我创建的/共享给我）
    await expect(page.getByRole('button', { name: '全部' })).toBeVisible();
    await expect(page.getByRole('button', { name: '我创建的' })).toBeVisible();
    await expect(page.getByRole('button', { name: '共享给我' })).toBeVisible();
    // 等应用卡片数据加载完成（避免骨架屏占位时误判通过）
    await waitDataReady(page, '.app-card__title');
    await expect(page.locator('[class*="app-card"], [class*="app-item"]').first()).toBeVisible();
  
});

