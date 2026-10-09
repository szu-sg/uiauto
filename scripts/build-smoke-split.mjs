#!/usr/bin/env node
/**
 * Split smoke.spec.js into one-test-per-file specs + shared helpers (platform case granularity).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'smoke.spec.js');
const OUT = path.join(__dirname, 'smoke-split');
const SHARED_REL = '../../_shared/smoke-knowledge-helpers.mjs';

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function buildSharedModule() {
  const chunks = [
    slice(14, 213),
    slice(428, 460),
    slice(511, 560),
    slice(649, 668),
    slice(835, 927),
  ];
  let body = chunks.join('\n\n');
  body = body.replace(
    /^const (BASE|HOME|APP_TYPES|TEMPLATES|RECENT_APPS|ASSET_URL) =/gm,
    'export const $1 =',
  );
  body = body.replace(/^async function /gm, 'export async function ');
  body = body.replace(/^function /gm, 'export function ');
  return `/** @generated from smoke.spec.js — do not edit per-case scripts by copying this file */
import { expect } from '@playwright/test';

${body}

export async function homeBeforeEach({ page }) {
  await page.goto(HOME);
  await page.waitForSelector('text=新建应用');
}
`;
}

const APP_TYPES = ['智能问答', '报告写作', '文档审查', '智能考试', '内容抽取'];
const TEMPLATES = [
  '零售供应商合同审查',
  '通用合同抽取',
  '科研项目结题验收申报书',
  '发票抽取',
  '新员工入职考试',
];
const RECENT_CASES = [
  ['SMK-044', '报告自动化'],
  ['SMK-045', '考试自动化'],
  ['SMK-046', '问答自动化'],
  ['SMK-047', '抽取自动化'],
  ['SMK-048', '审查自动化'],
];

/** @type {{ name: string, filename: string, script: string, tags: string[] }[]} */
const items = [];

function emit(name, testBlock, { imports = ['homeBeforeEach'], beforeEach = true } = {}) {
  const fromShared = imports.filter((s) => s !== 'homeBeforeEach' || beforeEach);
  const unique = [...new Set(fromShared)];
  const sharedImport = unique.length
    ? `import { ${unique.join(', ')} } from '${SHARED_REL}';\n`
    : '';
  const before = beforeEach ? `test.beforeEach(homeBeforeEach);\n\n` : '';
  const script = `// 知识基座冒烟 · ${name}
import { test, expect } from '@playwright/test';
${sharedImport}${before}${testBlock}
`;
  const safe = name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80);
  items.push({
    name,
    filename: `${safe}.spec.js`,
    script,
    tags: ['知识基座', '冒烟', 'imported'],
  });
}

function addLineTest(name, start, end, opts = {}) {
  const inner = slice(start, end);
  const m = inner.match(/test\([^,]+,\s*async\s*\(\{[^}]*\}\)\s*=>\s*\{([\s\S]*)\}\s*\);?\s*$/);
  const body = m
    ? `test('${name.replace(/'/g, "\\'")}', async ({ page }) => {${m[1]}\n});\n`
    : `${inner}\n`;
  emit(name, body, opts);
}

// A
addLineTest('SMK-001 首页正常加载', 223, 226);
addLineTest('SMK-002 顶部导航元素完整性', 228, 235);

// B
addLineTest('SMK-003 首页 → 应用模板', 239, 246);
addLineTest('SMK-004 应用模板 → 知识资产', 248, 253);
addLineTest('SMK-005 知识资产 → 首页', 255, 260);

// C
addLineTest('SMK-006 问答输入框可用', 265, 270);
addLineTest('SMK-007 发送问答', 272, 279);

// D
addLineTest('SMK-008 应用列表展示', 283, 292);
addLineTest('SMK-009 分类筛选切换', 294, 299);
addLineTest('SMK-010 应用搜索', 301, 311);

// E
addLineTest('SMK-011 新建应用弹出选择类型面板', 315, 321);
addLineTest('SMK-012 选择类型跳转创建页', 323, 333);
addLineTest('SMK-013 各类型创建页 URL 正确性', 335, 347);
addLineTest('SMK-014 新建应用-空名称表单校验', 349, 357);
addLineTest('SMK-015 新建应用-公开范围切换', 359, 384);
addLineTest('SMK-016 新建应用-取消关闭面板', 386, 396);
addLineTest('SMK-017 填写信息并确定进入配置页', 398, 411);

// F
for (const type of APP_TYPES) {
  const name = `SMK 完整创建：${type}`;
  emit(
    name,
    `test('${name}', async ({ page }) => {
  await createApp(page, '${type}', APP_TYPES['${type}']);
});\n`,
    { imports: ['homeBeforeEach', 'createApp', 'APP_TYPES'] },
  );
}

// G
const TEMPLATE_ASSERTS = {
  零售供应商合同审查: { assertText: '文档审查', assertBtn: null },
  通用合同抽取: { assertText: null, assertBtn: '开始抽取' },
  科研项目结题验收申报书: { assertText: null, assertBtn: '开始写作' },
  发票抽取: { assertText: null, assertBtn: '开始抽取' },
  新员工入职考试: { assertText: null, assertBtn: '开始生成' },
};
for (const tpl of TEMPLATES) {
  const name = `SMK 应用模板创建：${tpl}`;
  const meta = TEMPLATE_ASSERTS[tpl];
  let asserts = '';
  if (meta.assertText) {
    asserts += `  await expect(page.locator(\`text=${meta.assertText}\`)).toBeVisible();\n`;
  }
  if (meta.assertBtn) {
    asserts += `  await expect(page.locator(\`button:has-text("${meta.assertBtn}")\`)).toBeVisible();\n`;
  }
  emit(
    name,
    `test('${name}', async ({ page }) => {
  await page.goto(HOME);
  await page.waitForSelector('text=新建应用');
  const appUrl = await createAppFromTemplate(page, '${tpl}');
${asserts}  await deleteApp(page, appUrl);
});\n`,
    {
      imports: ['HOME', 'createAppFromTemplate', 'deleteApp'],
      beforeEach: false,
    },
  );
}
addLineTest('SMK-028 应用模板-接口无报错校验', 480, 503, {
  imports: ['homeBeforeEach', 'TEMPLATES'],
});

// H
const H_IMPORTS = ['navigateFolders', 'pickDocument', 'clickAndConfirm'];
addLineTest('SMK-029 报告写作后续-创作启动', 563, 581, { imports: H_IMPORTS, beforeEach: false });
addLineTest('SMK-030 文档审查后续-审查启动', 583, 603, { imports: H_IMPORTS, beforeEach: false });
addLineTest('SMK-031 智能考试后续-生成启动', 605, 622, { imports: H_IMPORTS, beforeEach: false });
addLineTest('SMK-032 智能抽取后续-抽取启动', 624, 642, { imports: H_IMPORTS, beforeEach: false });

// I
const I_IMPORTS = ['ASSET_URL', 'waitDataReady', 'parseCount', 'parseCardNumber', 'teamRow'];
for (const [start, end, name] of [
  [671, 684, 'SMK-033 知识资产页正常加载'],
  [686, 710, 'SMK-034 知识资产-子导航切换应用数据'],
  [712, 721, 'SMK-035 知识资产-子导航切换知识源'],
  [723, 753, 'SMK-036 知识资产-统计卡片展示（数字非零断言）'],
  [755, 762, 'SMK-037 知识资产-知识源管理表格'],
  [764, 773, 'SMK-038 知识资产-知识源已解析文档数校验'],
  [775, 786, 'SMK-039 知识资产-文档管理跳转'],
  [788, 803, 'SMK-040 知识资产-资产管理跳转'],
  [805, 813, 'SMK-041 知识资产-设置弹出AI服务管理面板'],
  [815, 827, 'SMK-042 知识资产-企业知识资产跳转'],
]) {
  addLineTest(name, start, end, { imports: I_IMPORTS, beforeEach: false });
}

// J
addLineTest('SMK-043 历史记录-最近应用列表展示', 965, 974);
for (const [id, key] of RECENT_CASES) {
  const name = `${id} 历史记录-最近应用打开（${key}）`;
  emit(
    name,
    `test('${name}', async ({ page }) => {
  const app = RECENT_APPS.find((a) => a.key === '${key}');
  await openRecentApp(page, app);
});\n`,
    { imports: ['openRecentApp', 'RECENT_APPS'], beforeEach: false },
  );
}

const sharedDir = path.join(OUT, '_shared');
fs.mkdirSync(sharedDir, { recursive: true });
fs.writeFileSync(path.join(sharedDir, 'smoke-knowledge-helpers.mjs'), buildSharedModule(), 'utf8');

fs.mkdirSync(OUT, { recursive: true });
for (const item of items) {
  fs.writeFileSync(path.join(OUT, item.filename), item.script, 'utf8');
}
fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify(
    { count: items.length, items: items.map(({ name, filename, tags }) => ({ name, filename, tags })) },
    null,
    2,
  ),
  'utf8',
);
const sampleLines = items[0].script.split('\n').length;
console.log(`Wrote ${items.length} specs + shared helpers to ${OUT} (sample ~${sampleLines} lines/case)`);
