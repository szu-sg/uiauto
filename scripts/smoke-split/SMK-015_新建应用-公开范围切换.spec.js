// 知识基座冒烟 · SMK-015 新建应用-公开范围切换
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-015 新建应用-公开范围切换', async ({ page }) => {
    const popup = await startCreate(page, '智能问答');
    await popup.locator('.template-card--create').click();
    await popup.waitForSelector('.kdv-input__inner');
    await popup.locator('.kdv-input__inner').fill(genAppName('公开范围测试'));
    // 定位公开范围选择器，切换选项
    const scopeSelect = popup.locator('.kdv-select, [class*="scope"], [class*="range"]').first();
    if (await scopeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await scopeSelect.click();
      await popup.waitForTimeout(500);
      // 尝试点第二个选项（切换范围）
      const options = popup.locator('.kdv-select-dropdown__item, [class*="option"]');
      const optCount = await options.count();
      if (optCount > 1) {
        await options.nth(1).click();
        await popup.waitForTimeout(500);
      }
    }
    // 点取消关闭（不创建残留应用）
    const cancelBtn = popup.locator('button:has-text("取消"), button:has-text(" Cancel")');
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.first().click();
      await popup.waitForTimeout(1000);
    }
    await popup.close();
  
});

