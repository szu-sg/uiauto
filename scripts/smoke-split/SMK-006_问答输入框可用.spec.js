// 知识基座冒烟 · SMK-006 问答输入框可用
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-006 问答输入框可用', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.click();
    await input.fill('冒烟测试问题');
    await expect(input).toHaveValue('冒烟测试问题');
  
});

