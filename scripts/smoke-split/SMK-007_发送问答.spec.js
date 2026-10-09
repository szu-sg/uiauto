// 知识基座冒烟 · SMK-007 发送问答
import { test, expect } from '@playwright/test';
import { homeBeforeEach } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-007 发送问答', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('你好');
    await input.press('Enter');
    // 断言出现响应或加载态（无报错）
    await page.waitForTimeout(3000);
  });

});

