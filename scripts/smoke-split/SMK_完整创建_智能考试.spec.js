// 知识基座冒烟 · SMK 完整创建：智能考试
import { test, expect } from '@playwright/test';
import { homeBeforeEach, createApp, APP_TYPES } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK 完整创建：智能考试', async ({ page }) => {
  await createApp(page, '智能考试', APP_TYPES['智能考试']);
});

