// 知识基座冒烟 · SMK-017 填写信息并确定进入配置页
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-017 填写信息并确定进入配置页', async ({ page }) => {
    const popup = await startCreate(page, '智能问答');
    await fillBasicInfo(popup, genAppName('智能问答'));
    expect(popup.url()).toContain('/qa/config/');
    // 闭环：删除刚创建的应用（已在配置页，直接删除）
    await popup.locator('button:has-text("基础配置")').first().click();
    await popup.waitForTimeout(1000);
    const delBtn = popup.locator('[class*="delete-section"] button:has-text("删除")');
    await delBtn.scrollIntoViewIfNeeded();
    await delBtn.click();
    await popup.locator('button:has-text("确认删除")').first().click();
    await popup.waitForTimeout(2000);
    await popup.close();
  
});

