// 知识基座冒烟 · SMK-032 智能抽取后续-抽取启动
import { test, expect } from '@playwright/test';
import { navigateFolders, pickDocument, clickAndConfirm } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-032 智能抽取后续-抽取启动', async ({ page }) => {
    await page.goto('https://365.kdocs.cn/aidocs/home/extraction/6a8a985bdbfe3bd9a246d5aa');
    await page.waitForLoadState();
    await page.locator('text=我的 WPS 文件').first().click();
    await page.waitForTimeout(2500);
    await navigateFolders(page, ['自动化测试团队', '样张', '抽取']);
    await pickDocument(page, '示例简历1');
    // 等待文档解析完成 → 出现"开始抽取"
    await page.locator('button:has-text("开始抽取")').waitFor({ timeout: 180000 });
    // 点击"开始抽取"并确认抽取启动（含 force 重试兜底）
    await clickAndConfirm(
      page,
      page.locator('button:has-text("开始抽取")'),
      async (t) => {
        await expect(page.locator('text=AI 正在抽取数据')).toBeVisible({ timeout: t });
      },
      60000
    );
  
});

