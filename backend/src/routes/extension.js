import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.join(__dirname, '../../../extension');

function readExtensionVersion() {
  try {
    const raw = fs.readFileSync(path.join(extensionDir, 'version.json'), 'utf8');
    const data = JSON.parse(raw);
    return {
      version: data.version || '1.0.0',
      changelog: data.changelog || '',
      minPlatformVersion: data.minPlatformVersion || '1.0.0',
    };
  } catch (_) {
    return { version: '1.0.0', changelog: '', minPlatformVersion: '1.0.0' };
  }
}

function buildExtensionZipBuffer() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    archive.directory(extensionDir, false);
    archive.finalize();
  });
}

export const router = Router();

router.get('/info', (_req, res) => {
  const meta = readExtensionVersion();
  const exists = fs.existsSync(path.join(extensionDir, 'manifest.json'));
  res.json({
    ...meta,
    available: exists,
    downloadUrl: '/api/extension/download',
    installGuide: [
      '下载 ZIP 并解压到本地目录',
      '打开 Chrome → 扩展程序 → 管理扩展程序',
      '开启「开发者模式」',
      '点击「加载已解压的扩展程序」，选择解压后的文件夹',
      '在 UIAuto 打开「用例录制」页面，扩展将自动连接',
    ],
  });
});

router.get('/download', async (_req, res) => {
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
    return res.status(404).json({ error: '扩展包不存在' });
  }

  try {
    const meta = readExtensionVersion();
    const filename = `uiauto-recorder-v${meta.version}.zip`;
    const body = await buildExtensionZipBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(body.length));
    res.send(body);
  } catch (err) {
    console.error('[Extension] zip build failed:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || '打包扩展失败' });
    }
  }
});
