// 知识基座冒烟 · SMK 完整创建：报告写作
import { test, expect } from '@playwright/test';
import { homeBeforeEach, createApp, APP_TYPES } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK 完整创建：报告写作', async ({ page }) => {
  await createApp(page, '报告写作', APP_TYPES['报告写作']);
});

