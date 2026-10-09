// 知识基座冒烟 · SMK-036 知识资产-统计卡片展示（数字非零断言）
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-036 知识资产-统计卡片展示（数字非零断言）', async ({ page }) => {
    await page.goto(ASSET_URL);
    // 等表格数据加载完成，确保统计卡片的数字也已就绪（而非骨架占位）
    await waitDataReady(page, '.source-table__name-cell');
    // 文档解析：文档已解析 X 份，断言 X > 0
    const parseText = await page.locator('.overview-card', { hasText: '文档解析' }).first().innerText();
    const docParsed = parseCardNumber(parseText, '文档已解析');
    expect(docParsed, `文档已解析应>0，实际: ${docParsed}`).toBeGreaterThan(0);
    // 知识增强：摘要 X, 大纲 X, 标签 X，三者均 > 0
    const enhanceText = await page.locator('.overview-card', { hasText: '知识增强' }).first().innerText();
    for (const kw of ['摘要', '大纲', '标签']) {
      const v = parseCardNumber(enhanceText, kw);
      expect(v, `${kw} 应>0，实际: ${v}`).toBeGreaterThan(0);
    }
    // 关系图谱：实体已抽取 X, 关系组 X，≥0（空环境可为 0）
    const graphText = await page.locator('.overview-card', { hasText: '关系图谱' }).first().innerText();
    for (const kw of ['实体已抽取', '关系组']) {
      const v = parseCardNumber(graphText, kw);
      expect(v, `${kw} 应≥0，实际: ${v}`).toBeGreaterThanOrEqual(0);
    }
    // 知识检测：冲突知识 X, 重复知识 X, 缺失知识 X，≥0（空环境可为 0）
    const checkText = await page.locator('.overview-card', { hasText: '知识检测' }).first().innerText();
    for (const kw of ['冲突知识', '重复知识', '缺失知识']) {
      const v = parseCardNumber(checkText, kw);
      expect(v, `${kw} 应≥0，实际: ${v}`).toBeGreaterThanOrEqual(0);
    }
    // 知识应用：累计被引用的知识应用数量 X，≥0
    const appText = await page.locator('.overview-card', { hasText: '知识应用' }).first().innerText();
    const appCount = parseCardNumber(appText, '应用数量');
    expect(appCount, `知识应用数量应≥0，实际: ${appCount}`).toBeGreaterThanOrEqual(0);
  
});

