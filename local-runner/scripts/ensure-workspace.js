import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, '../workspace');

const PACKAGE_JSON = {
  name: 'uiauto-local-runner-workspace',
  private: true,
  type: 'module',
};

const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';
import fs from 'fs';

const authFile = process.env.AUTH_FILE || 'auth.json';

export default defineConfig({
  testDir: './cases',
  testMatch: '**/*.{spec,test}.{ts,js}',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: false,
    viewport: null,
    launchOptions: { args: ['--start-maximized'] },
    ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
`;

fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });

const pkgPath = path.join(workspace, 'package.json');
if (!fs.existsSync(pkgPath)) {
  fs.writeFileSync(pkgPath, `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`, 'utf8');
}

const cfgPath = path.join(workspace, 'playwright.config.ts');
fs.writeFileSync(cfgPath, PLAYWRIGHT_CONFIG, 'utf8');
