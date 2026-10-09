// 知识基座冒烟 · SMK-030 文档审查后续-审查启动
import { test, expect } from '@playwright/test';
import { navigateFolders, pickDocument, clickAndConfirm } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-030 文档审查后续-审查启动', async ({ page }) => {
    await page.goto('https://365.kdocs.cn/aidocs/home/review/6a8a983edbfe3bd9a246d5a6');
    await page.waitForLoadState();
    await page.locator('button:has-text("WPS 云文件")').first().click();
    await page.waitForTimeout(2500);
    await navigateFolders(page, ['自动化测试团队', '样张', '审查', '制造业生产报告']);
    await pickDocument(page, '生产检验报告');
    // 审查应用：选完文档后需点击"下一步"开始审查（页面存在多个"下一步"，取可见的第一个）
    // 明确等待"下一步"变为可用（文档解析完成）
    const nextBtn = page.locator('button:has-text("下一步")').filter({ visible: true }).first();
    await expect(nextBtn).toBeEnabled({ timeout: 180000 });
    // 点击"下一步"并确认审查启动：按钮消失（已触发）或出现审查进度即通过
    await clickAndConfirm(
      page,
      nextBtn,
      async (t) => {
        await expect(page.locator('text=文档审查中').or(page.locator('text=审查中'))).toBeVisible({ timeout: t });
      },
      120000
    );
  
});

