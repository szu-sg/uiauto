// 知识基座冒烟 · SMK 应用模板创建：科研项目结题验收申报书
import { test, expect } from '@playwright/test';
import { HOME, createAppFromTemplate, deleteApp } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK 应用模板创建：科研项目结题验收申报书', async ({ page }) => {
  await page.goto(HOME);
  await page.waitForSelector('text=新建应用');
  const appUrl = await createAppFromTemplate(page, '科研项目结题验收申报书');
  await expect(page.locator(`button:has-text("开始写作")`)).toBeVisible();
  await deleteApp(page, appUrl);
});

