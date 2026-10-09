// 知识基座冒烟 · SMK-001 首页正常加载
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-001 首页正常加载', async ({ page }) => {
    await expect(page).toHaveTitle('WPS智能知识基座');
    expect(page.url()).toContain('/aidocs/home/');
  
});

