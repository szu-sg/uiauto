// 知识基座冒烟 · SMK-009 分类筛选切换
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-009 分类筛选切换', async ({ page }) => {
    for (const tab of ['我创建的', '共享给我', '全部']) {
      await page.locator('button', { hasText: tab }).first().click();
      await page.waitForTimeout(1000);
    }
  
});

