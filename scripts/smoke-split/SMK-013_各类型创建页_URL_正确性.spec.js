// 知识基座冒烟 · SMK-013 各类型创建页 URL 正确性
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-013 各类型创建页 URL 正确性', async ({ page }) => {
    for (const [type, meta] of Object.entries(APP_TYPES)) {
      await page.locator('.create-app-btn').first().click();
      await page.waitForSelector('.create-app-btn__option');
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('.create-app-btn__option', { hasText: type }).click(),
      ]);
      await popup.waitForLoadState();
      expect(popup.url(), `${type} 创建页 URL`).toContain(meta.createUrl);
      await popup.close();
    }
  
});

