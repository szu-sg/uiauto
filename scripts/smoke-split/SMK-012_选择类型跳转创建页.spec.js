// 知识基座冒烟 · SMK-012 选择类型跳转创建页
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-012 选择类型跳转创建页', async ({ page }) => {
    await page.locator('.create-app-btn').first().click();
    await page.waitForSelector('.create-app-btn__option');
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('.create-app-btn__option', { hasText: '智能问答' }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('/aidocs/home/qa/create');
    await expect(popup).toHaveTitle('新建智能问答');
  
});

