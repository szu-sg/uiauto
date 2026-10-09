// 知识基座冒烟 · SMK-037 知识资产-知识源管理表格
import { test, expect } from '@playwright/test';
import { ASSET_URL, waitDataReady, parseCount, parseCardNumber, teamRow } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-037 知识资产-知识源管理表格', async ({ page }) => {
    await page.goto(ASSET_URL);
    await waitDataReady(page, '.source-table__name-cell');
    await expect(page.locator('text=知识源管理').first()).toBeVisible();
    await expect(page.locator('.source-table__name-cell', { hasText: '自动化测试团队' }).first()).toBeVisible();
    await expect(page.locator('.source-table__link', { hasText: '文档管理' }).first()).toBeVisible();
    await expect(page.locator('.source-table__link', { hasText: '资产管理' }).first()).toBeVisible();
  
});

