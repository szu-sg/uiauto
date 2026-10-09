// 知识基座冒烟 · SMK 完整创建：内容抽取
import { test, expect } from '@playwright/test';
import { homeBeforeEach, createApp, APP_TYPES } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK 完整创建：内容抽取', async ({ page }) => {
  await createApp(page, '内容抽取', APP_TYPES['内容抽取']);
});

