// 知识基座冒烟 · SMK-044 历史记录-最近应用打开（报告自动化）
import { test, expect } from '@playwright/test';
import { openRecentApp, RECENT_APPS } from '../../_shared/smoke-knowledge-helpers.mjs';
test('SMK-044 历史记录-最近应用打开（报告自动化）', async ({ page }) => {
  const app = RECENT_APPS.find((a) => a.key === '报告自动化');
  await openRecentApp(page, app);
});

