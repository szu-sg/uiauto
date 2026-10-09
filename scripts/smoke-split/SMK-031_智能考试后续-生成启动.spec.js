// 知识基座冒烟 · SMK-031 智能考试后续-生成启动
import { test, expect } from '@playwright/test';
import { navigateFolders, pickDocument, clickAndConfirm } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-031 智能考试后续-生成启动', async ({ page }) => {
    await page.goto('https://365.kdocs.cn/aidocs/home/exam/6a8a984ddbfe3bd9a246d5a8');
    await page.waitForLoadState();
    // 点击"选择云文档"区域打开文件选择器
    await page.locator('text=选择云文档').first().click();
    await page.waitForTimeout(2500);
    await navigateFolders(page, ['自动化测试团队', '样张', '考试']);
    await pickDocument(page, 'WPS 365');
    // 点"开始生成"并确认生成启动（含 force 重试兜底）
    await clickAndConfirm(
      page,
      page.locator('button:has-text("开始生成")'),
      async (t) => {
        await expect(page.locator('text=AI 正在生成试卷')).toBeVisible({ timeout: t });
      },
      60000
    );
  
});

