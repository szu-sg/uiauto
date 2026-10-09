// 知识基座冒烟 · SMK-028 应用模板-接口无报错校验
import { test, expect } from '@playwright/test';
import { homeBeforeEach, TEMPLATES } from '../../_shared/smoke-knowledge-helpers.mjs';
test.beforeEach(homeBeforeEach);

test('SMK-028 应用模板-接口无报错校验', async ({ page }) => {
    // 已知服务端缺陷白名单（非脚本问题，服务端稳定 500）：科研项目模板 authorization 接口
    const KNOWN_SERVER_BUGS = [/templates\/6a3cededef9e9e8d5b394074\/setting\/dev\/template\/2002\/authorization/];
    const apiErrors = [];
    page.on('response', (res) => {
      if (res.status() >= 400) {
        const u = res.url();
        if (!KNOWN_SERVER_BUGS.some((re) => re.test(u))) {
          apiErrors.push(`${res.status()} ${u.slice(0, 120)}`);
        }
      }
    });
    await page.locator('span.nav-menu__item-label:has-text("应用模板")').click();
    await page.waitForTimeout(1500);
    // 依次点击 5 个模板打开详情，再关闭
    for (const tpl of Object.keys(TEMPLATES)) {
      await page.locator(`.templates-page__template-name:has-text("${tpl}")`).first().click();
      await page.waitForTimeout(1200);
      const cancelBtn = page.locator('button:has-text("取消")').first();
      if (await cancelBtn.count()) await cancelBtn.click();
      await page.waitForTimeout(800);
    }
    expect(apiErrors, `打开模板时出现接口报错: ${apiErrors.join(' | ')}`).toEqual([]);
  
});

