// 知识基座冒烟 · SMK 应用模板创建：零售供应商合同审查
import { test, expect } from '@playwright/test';
import { HOME, createAppFromTemplate, deleteApp } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK 应用模板创建：零售供应商合同审查', async ({ page }) => {
  await page.goto(HOME);
  await page.waitForSelector('text=新建应用');
  const appUrl = await createAppFromTemplate(page, '零售供应商合同审查');
  await expect(page.locator(`text=文档审查`)).toBeVisible();
  await deleteApp(page, appUrl);
});

