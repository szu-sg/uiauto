// 知识基座冒烟 · SMK-011 新建应用弹出选择类型面板
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-011 新建应用弹出选择类型面板', async ({ page }) => {
    await page.locator('.create-app-btn').first().click();
    await expect(page.locator('text=选择应用类型')).toBeVisible();
    for (const t of ['智能问答', '报告写作', '文档审查', '智能考试', '内容抽取']) {
      await expect(page.locator('.create-app-btn__option', { hasText: t })).toBeVisible();
    }
  
});

