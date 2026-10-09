// 知识基座冒烟 · SMK-029 报告写作后续-创作启动
import { test, expect } from '@playwright/test';
import { navigateFolders, pickDocument, clickAndConfirm } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-029 报告写作后续-创作启动', async ({ page }) => {
    await page.goto('https://365.kdocs.cn/aidocs/home/report/6a8a9825dbfe3bd9a246d5a4');
    await page.waitForLoadState();
    await page.locator('button:has-text("选择云文档")').first().click();
    await page.waitForTimeout(2500);
    await navigateFolders(page, ['自动化测试团队', '样张', '报告写作', 'CSR写作材料【脱敏】']);
    await pickDocument(page, 'CSR Table');
    // 等待文档解析完成 → 出现"开始写作"
    await page.locator('button:has-text("开始写作")').waitFor({ timeout: 180000 });
    // 点击"开始写作"并确认创作启动：按钮消失（已进入生成态）即通过，不依赖一闪而过的"写作计划"提示文本
    await clickAndConfirm(
      page,
      page.locator('button:has-text("开始写作")'),
      async (t) => {
        await expect(page.locator('button:has-text("开始写作")').first()).toBeHidden({ timeout: t });
      },
      60000
    );
  
});

