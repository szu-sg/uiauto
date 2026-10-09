// 知识基座冒烟 · SMK-014 新建应用-空名称表单校验
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-014 新建应用-空名称表单校验', async ({ page }) => {
    const popup = await startCreate(page, '智能问答');
    await popup.locator('.template-card--create').click();
    await popup.waitForSelector('.kdv-input__inner');
    // 断言：名称为空时确定按钮 disabled
    const confirmBtn = popup.locator('button:has-text("确定")');
    await expect(confirmBtn).toBeDisabled();
    await popup.close();
  
});

