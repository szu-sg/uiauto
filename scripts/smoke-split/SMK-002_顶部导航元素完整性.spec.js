// 知识基座冒烟 · SMK-002 顶部导航元素完整性
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-002 顶部导航元素完整性', async ({ page }) => {
    await expect(page.locator('text=新建应用')).toBeVisible();
    for (const nav of ['首页', '应用模板', '知识资产']) {
      await expect(page.locator(`span.nav-menu__item-label`, { hasText: nav })).toBeVisible();
    }
    await expect(page.locator('text=API接入')).toBeVisible();
  });

});

