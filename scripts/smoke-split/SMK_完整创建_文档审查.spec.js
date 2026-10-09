// 知识基座冒烟 · SMK 完整创建：文档审查
import { test, expect } from '@playwright/test';
import { homeBeforeEach, createApp, APP_TYPES } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK 完整创建：文档审查', async ({ page }) => {
  await createApp(page, '文档审查', APP_TYPES['文档审查']);
});

