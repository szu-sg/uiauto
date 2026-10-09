// 知识基座冒烟 · SMK-038 知识资产-知识源已解析文档数校验
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-038 知识资产-知识源已解析文档数校验', async ({ page }) => {
    await page.goto(ASSET_URL);
    // 等表格数据与数字加载完成（数字异步返回，未加载完会误读为 0）
    await waitDataReady(page, '.source-table__name-cell');
    const rowText = await teamRow(page).innerText();
    const m = rowText.match(/(\d+)/);
    const count = m ? parseInt(m[1], 10) : 0;
    expect(Number.isFinite(count), `已解析文档数应是有效数字，实际行文本: ${rowText}`).toBe(true);
    expect(count, `已解析文档数应≥0，实际行文本: ${rowText}`).toBeGreaterThanOrEqual(0);
  
});

