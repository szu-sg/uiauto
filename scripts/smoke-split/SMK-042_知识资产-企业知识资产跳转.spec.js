// 知识基座冒烟 · SMK-042 知识资产-企业知识资产跳转
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-042 知识资产-企业知识资产跳转', async ({ page }) => {
    await page.goto(ASSET_URL);
    await page.waitForSelector('.resource-page__dashboard-btn');
    // 点击后同页跳转到企业知识资产管理后台（非新标签页）
    await page.locator('.resource-page__dashboard-btn').click();
    await page.waitForURL(/work\.wps\.cn\/aidocs\/home\/asset\/company/);
    expect(page.url()).toContain('work.wps.cn/aidocs/home/asset/company');
    // 看板内容位于 iframe（aidocs.wps.cn），断言「文档解析-文档已解析 X 份」，X>0
    const frame = page.frameLocator('iframe[src*="aidocs.wps.cn"]');
    await expect(frame.locator('text=文档已解析').first()).toBeVisible({ timeout: 30000 });
    const frameText = await frame.locator('body').innerText();
    expect(parseCount(frameText, '文档已解析')).toBeGreaterThan(0);
  
});

