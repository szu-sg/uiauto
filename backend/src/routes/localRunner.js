import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerDir = path.join(__dirname, '../../../local-runner');

const ZIP_IGNORE = [
  'node_modules/**',
  'workspace/**',
  'package-lock.json',
];

function readRunnerVersion() {
  try {
    const raw = fs.readFileSync(path.join(runnerDir, 'version.json'), 'utf8');
    const data = JSON.parse(raw);
    return {
      version: data.version || '1.0.0',
      changelog: data.changelog || '',
      minNodeVersion: data.minNodeVersion || '18.0.0',
    };
  } catch (_) {
    return { version: '1.0.0', changelog: '', minNodeVersion: '18.0.0' };
  }
}

function buildRunnerZipBuffer() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    archive.glob('**/*', {
      cwd: runnerDir,
      dot: false,
      ignore: ZIP_IGNORE,
    });
    archive.finalize();
  });
}

export const router = Router();

router.get('/info', (_req, res) => {
  const meta = readRunnerVersion();
  const exists = fs.existsSync(path.join(runnerDir, 'server.js'));
  res.json({
    ...meta,
    available: exists,
    downloadUrl: '/api/local-runner/download',
    defaultUrl: 'http://127.0.0.1:9321',
    installGuide: [
      '安装 Node.js 18+（https://nodejs.org/）',
      '下载运行器 ZIP 并解压',
      'Windows：双击 start.bat（后台静默启动；可选 setup-autostart.bat 开机自启）',
      'macOS / Linux：chmod +x start.sh && ./start.sh',
      '看到 listening on http://127.0.0.1:9321 后即可「一键运行」',
    ],
    repoCommands: {
      install: 'npm run local-runner:install',
      start: 'npm run local-runner',
    },
    standaloneCommands: {
      install: 'npm install',
      start: 'npm start',
    },
  });
});

router.get('/download', async (_req, res) => {
  if (!fs.existsSync(path.join(runnerDir, 'server.js'))) {
    return res.status(404).json({ error: '本机运行器包不存在' });
  }

  try {
    const meta = readRunnerVersion();
    const filename = `uiauto-local-runner-v${meta.version}.zip`;
    const body = await buildRunnerZipBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(body.length));
    res.send(body);
  } catch (err) {
    console.error('[LocalRunner] zip build failed:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || '打包本机运行器失败' });
    }
  }
});
