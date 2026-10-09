// 知识基座冒烟 · SMK-010 应用搜索
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-010 应用搜索', async ({ page }) => {
    // 点击搜索按钮打开搜索输入框
    await page.locator('[aria-label="搜索应用"]').click();
    // 在搜索输入框填写关键词
    const input = page.locator('input[placeholder="搜索应用"]');
    await input.fill('合同');
    await page.waitForTimeout(1500);
    // 断言出现搜索结果（应用卡片过滤）
    await expect(page.locator('[class*="app-card"], [class*="app-item"]').first()).toBeVisible();
  });

});

