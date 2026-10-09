// 知识基座冒烟 · SMK-033 知识资产页正常加载
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-033 知识资产页正常加载', async ({ page }) => {
    await page.goto(ASSET_URL);
    // 等表格数据加载完成（统计卡片/表格为异步，避免数据未加载就断言标题）
    await waitDataReady(page, '.source-table__name-cell');
    // 子导航
    await expect(page.locator('.resource-page__tab', { hasText: '知识源' })).toBeVisible();
    await expect(page.locator('.resource-page__tab', { hasText: '应用数据' })).toBeVisible();
    // 5 个统计卡片（数据加载完成后标题与数字均已就绪）
    for (const k of ['文档已解析', '知识增强', '关系图谱', '知识检测', '知识应用']) {
      await expect(page.locator(`text=${k}`).first()).toBeVisible();
    }
    // 知识源管理表格
    await expect(page.locator('text=知识源管理').first()).toBeVisible();
  
});

