#!/usr/bin/env node
/**
 * UIAuto Local Runner — runs Playwright tests on the developer machine (headed).
 * Listens on 127.0.0.1:9321 by default.
 */
import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WORKSPACE = path.join(ROOT, 'workspace');
const CASES_DIR = path.join(WORKSPACE, 'cases');
const PORT = Number(process.env.UIAUTO_LOCAL_RUNNER_PORT || 9321);
const HOST = process.env.UIAUTO_LOCAL_RUNNER_HOST || '127.0.0.1';
const VERSION = '1.0.0';

/** @type {Map<string, object>} */
const runs = new Map();

let depsReady = false;
let depsInstalling = false;

function log(...args) {
  console.log('[UIAuto Local Runner]', ...args);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  // 允许从线上平台 (如 10.x) 访问本机 127.0.0.1（Chrome Private Network Access）
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function runCmd(cwd, command, args, onData) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, CI: '', PLAYWRIGHT_HEADLESS: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      onData?.(text, 'stdout');
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      onData?.(text, 'stderr');
    });
    child.on('close', (code) => resolve({ code, stdout, stderr, child }));
  });
}

async function ensureWorkspace() {
  await fsp.mkdir(CASES_DIR, { recursive: true });
  const ensureScript = path.join(ROOT, 'scripts', 'ensure-workspace.js');
  if (fs.existsSync(ensureScript)) {
    await import(pathToFileURL(ensureScript).href);
  }
}

async function ensureDeps() {
  if (depsReady) return;
  if (depsInstalling) {
    while (depsInstalling) await new Promise((r) => setTimeout(r, 200));
    return;
  }
  depsInstalling = true;
  try {
    await ensureWorkspace();
    const nm = path.join(ROOT, 'node_modules', '@playwright', 'test');
    if (!fs.existsSync(nm)) {
      log('Installing dependencies (first run)…');
      const install = await runCmd(ROOT, 'npm', ['install', '--no-fund', '--no-audit']);
      if (install.code !== 0) {
        throw new Error(install.stderr || install.stdout || 'npm install failed');
      }
    }
    const chromiumMarker = path.join(ROOT, 'node_modules', 'playwright-core', '.local-browsers');
    if (!fs.existsSync(chromiumMarker)) {
      log('Installing Chromium (first run)…');
      const pw = await runCmd(ROOT, 'npx', ['playwright', 'install', 'chromium']);
      if (pw.code !== 0) {
        log('playwright install warning:', pw.stderr || pw.stdout);
      }
    }
    depsReady = true;
  } finally {
    depsInstalling = false;
  }
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'case.spec.ts'));
  if (!/^[\w.-]+\.(spec|test)\.(ts|js)$/i.test(base)) {
    return 'case.spec.ts';
  }
  return base;
}

async function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function findScreenshot(runDir) {
  const files = await walkFiles(runDir);
  const pngs = files.filter((f) => /\.png$/i.test(f));
  const preferred = pngs.find((f) => /test-failed|screenshot/i.test(f)) || pngs[0];
  return preferred || null;
}

async function findVideo(runDir) {
  const files = await walkFiles(runDir);
  const videos = files.filter((f) => /\.(webm|mp4)$/i.test(f));
  if (!videos.length) return null;
  let best = videos[0];
  let bestSize = 0;
  for (const f of videos) {
    try {
      const size = (await fsp.stat(f)).size;
      if (size > bestSize) {
        bestSize = size;
        best = f;
      }
    } catch (_) {}
  }
  return best;
}

function publicRun(run) {
  const base = `http://${HOST}:${PORT}`;
  return {
    id: run.id,
    status: run.status,
    case_name: run.caseName || null,
    log_text: run.log_text || '',
    error_message: run.error_message || null,
    screenshot_url: run.screenshotPath
      ? `${base}/artifacts/${run.id}/screenshot`
      : null,
    screenshot_path: run.screenshotPath ? `local/${run.id}` : null,
    video_url: run.videoPath
      ? `${base}/artifacts/${run.id}/video`
      : null,
    started_at: run.startedAt || null,
    finished_at: run.finishedAt || null,
  };
}

async function executeRun(runId) {
  const run = runs.get(runId);
  if (!run) return;

  run.status = 'running';
  run.startedAt = new Date().toISOString();
  run.log_text = '';

  const caseDir = path.join(CASES_DIR, runId);
  const specPath = path.join(caseDir, run.filename);
  const relSpec = path.relative(WORKSPACE, specPath).replace(/\\/g, '/');
  const outputDir = path.join(WORKSPACE, 'test-results', runId);
  const artifactsDir = path.join(WORKSPACE, '.artifacts', runId);

  try {
    await fsp.rm(caseDir, { recursive: true, force: true });
    await fsp.mkdir(caseDir, { recursive: true });
    await fsp.writeFile(specPath, run.script, 'utf8');

    if (run.storageState?.cookies?.length || run.storageState?.origins?.length) {
      await fsp.writeFile(
        path.join(caseDir, 'auth.json'),
        JSON.stringify({
          cookies: run.storageState.cookies || [],
          origins: run.storageState.origins || [],
        }, null, 2),
        'utf8',
      );
    }

    await fsp.rm(outputDir, { recursive: true, force: true });
    await fsp.rm(artifactsDir, { recursive: true, force: true });
    await fsp.mkdir(artifactsDir, { recursive: true });

    const authFile = path.join(caseDir, 'auth.json');
    const args = [
      'playwright', 'test', relSpec,
      '--reporter=list',
      '--headed',
      '--project=chromium',
      '--output', path.relative(WORKSPACE, outputDir).replace(/\\/g, '/'),
    ];

    const appendLog = (text) => {
      run.log_text = (run.log_text + text).slice(-100000);
    };

    const result = await new Promise((resolve) => {
      const child = spawn('npx', args, {
        cwd: WORKSPACE,
        shell: true,
        env: {
          ...process.env,
          CI: '',
          PLAYWRIGHT_HEADLESS: '0',
          AUTH_FILE: fs.existsSync(authFile) ? authFile : '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      run.child = child;
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        const t = d.toString();
        stdout += t;
        appendLog(t);
      });
      child.stderr.on('data', (d) => {
        const t = d.toString();
        stderr += t;
        appendLog(t);
      });
      child.on('close', (code) => {
        run.child = null;
        resolve({ code, stdout, stderr });
      });
      child.on('error', (err) => {
        run.child = null;
        resolve({ code: 1, stdout, stderr: err.message });
      });
    });

    if (run.status === 'cancelled') return;

    const shot = await findScreenshot(outputDir);
    if (shot) {
      const dest = path.join(artifactsDir, 'screenshot.png');
      await fsp.copyFile(shot, dest);
      run.screenshotPath = dest;
    }

    const vid = await findVideo(outputDir);
    if (vid) {
      const ext = path.extname(vid).toLowerCase() || '.webm';
      const dest = path.join(artifactsDir, `recording${ext}`);
      await fsp.copyFile(vid, dest);
      run.videoPath = dest;
    }

    run.finishedAt = new Date().toISOString();
    if (result.code === 0) {
      run.status = 'passed';
      run.error_message = null;
    } else {
      run.status = 'failed';
      const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').filter(Boolean).slice(-8).join('\n');
      run.error_message = tail || '用例执行失败';
    }
  } catch (err) {
    run.status = 'failed';
    run.finishedAt = new Date().toISOString();
    run.error_message = err.message || '试跑异常';
    run.log_text = `${run.log_text || ''}\n[error] ${run.error_message}\n`.slice(-100000);
  }
}

async function handleRequest(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      const playwrightReady = fs.existsSync(path.join(ROOT, 'node_modules', '@playwright', 'test'));
      sendJson(res, 200, {
        ok: true,
        version: VERSION,
        playwrightReady,
        depsInstalling,
        nodeVersion: process.version,
        host: HOST,
        port: PORT,
        url: `http://${HOST}:${PORT}`,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/runs') {
      const limit = Math.min(100, Number(url.searchParams.get('limit')) || 20);
      const items = [...runs.values()]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, limit)
        .map(publicRun);
      sendJson(res, 200, { items });
      return;
    }

    const runGet = pathname.match(/^\/runs\/([^/]+)$/);
    if (req.method === 'GET' && runGet) {
      const run = runs.get(runGet[1]);
      if (!run) return sendJson(res, 404, { error: '试跑记录不存在' });
      return sendJson(res, 200, publicRun(run));
    }

    const runCancel = pathname.match(/^\/runs\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && runCancel) {
      const run = runs.get(runCancel[1]);
      if (!run) return sendJson(res, 404, { error: '试跑记录不存在' });
      if (run.status === 'passed' || run.status === 'failed' || run.status === 'cancelled') {
        return sendJson(res, 400, { error: '该试跑已结束' });
      }
      run.status = 'cancelled';
      run.finishedAt = new Date().toISOString();
      run.error_message = '已取消';
      if (run.child) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/PID', String(run.child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
          } else {
            run.child.kill('SIGTERM');
          }
        } catch (_) {}
        run.child = null;
      }
      return sendJson(res, 200, { ok: true, cancelled: true });
    }

    const artifactGet = pathname.match(/^\/artifacts\/([^/]+)\/(screenshot|video)$/);
    if (req.method === 'GET' && artifactGet) {
      const run = runs.get(artifactGet[1]);
      const kind = artifactGet[2];
      const filePath = kind === 'video' ? run?.videoPath : run?.screenshotPath;
      if (!filePath || !fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: kind === 'video' ? '录屏不存在' : '截图不存在' });
      }
      const data = await fsp.readFile(filePath);
      cors(res);
      const type = kind === 'video'
        ? (filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm')
        : 'image/png';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
      return;
    }

    if (req.method === 'POST' && pathname === '/runs') {
      const body = await readBody(req);
      const script = String(body.script || '').trim();
      if (!script) return sendJson(res, 400, { error: 'script 必填' });

      await ensureDeps();

      const id = randomUUID();
      const run = {
        id,
        status: 'pending',
        script,
        filename: sanitizeFilename(body.filename),
        storageState: body.storageState && typeof body.storageState === 'object' ? body.storageState : null,
        caseName: body.caseName ? String(body.caseName).trim() : null,
        log_text: '',
        error_message: null,
        screenshotPath: null,
        videoPath: null,
        child: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      };
      runs.set(id, run);
      executeRun(id).catch((err) => {
        const r = runs.get(id);
        if (r && r.status !== 'cancelled') {
          r.status = 'failed';
          r.error_message = err.message || '试跑异常';
          r.finishedAt = new Date().toISOString();
        }
      });
      return sendJson(res, 202, { id, status: 'pending' });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || '服务器错误' });
  }
}

async function main() {
  await ensureWorkspace();
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    log(`listening on http://${HOST}:${PORT}`);
    log('Press Ctrl+C to stop');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
