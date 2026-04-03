import './loadEnv.js'; // 必须最先加载，否则 executor 等模块读不到 .env（见 loadEnv.js 注释）
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameRoot = path.dirname(fileURLToPath(import.meta.url));

import './logger.js'; // 将 console 输出同时写入 backend/data/uiauto.log
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { router as plansRouter } from './routes/plans.js';
import { router as runsRouter } from './routes/runs.js';
import { router as githubRouter } from './routes/github.js';
import { router as authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { loadAll as loadSchedules } from './services/scheduler.js';
import { db as _startupDb } from './db/schema.js';

const __dirname = __dirnameRoot;
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/plans', requireAuth, plansRouter);
app.use('/api/runs', requireAuth, runsRouter);
app.use('/api/github', requireAuth, githubRouter);

// Static result files (screenshots, videos) - path like /results/1/2/screenshot.png
const resultsDir = path.join(__dirname, '../results');
app.use('/results', express.static(resultsDir));

// 生产环境：提供前端静态资源（npm run build 后 backend/public 存在）
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/results')) return next();
  const index = path.join(publicDir, 'index.html');
  fs.existsSync(index) ? res.sendFile(index) : next();
});

// 全局错误处理：未捕获的异常统一返回 500 并打出日志
app.use((err, req, res, next) => {
  console.error('[Error]', err.message || err);
  res.status(500).json({ error: err.message || '内部服务错误' });
});

// 防止未捕获异常导致进程直接退出
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message || err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('[unhandledRejection]', reason);
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// ── 启动时恢复：将上次进程退出时仍处于 running/pending 状态的 run 标记为 failed ──
(function recoverStaleRuns() {
  try {
    const staleRuns = _startupDb.prepare(
      "SELECT id FROM runs WHERE status IN ('running', 'pending')"
    ).all();
    if (staleRuns.length === 0) return;
    const msg = '后端已重启，本次运行在执行中途被中断，请重新触发。';
    for (const r of staleRuns) {
      _startupDb.prepare(
        "UPDATE runs SET status = 'failed', finished_at = datetime('now', '+8 hours'), log_text = ?, progress_phase = NULL WHERE id = ?"
      ).run(msg, r.id);
      _startupDb.prepare(
        "UPDATE run_cases SET status = 'failed', error_message = '后端重启，执行中断' WHERE run_id = ? AND status IN ('running', 'pending')"
      ).run(r.id);
    }
    console.log(`[Startup] 已将 ${staleRuns.length} 条中断的运行记录标记为失败`);
  } catch (e) {
    console.error('[Startup] 恢复 stale runs 失败:', e.message);
  }
}());

app.listen(PORT, HOST, () => {
  console.log(`UIAuto backend http://${HOST}:${PORT}`);
  try {
    loadSchedules();
  } catch (e) {
    console.error('[Scheduler] 启动加载定时任务失败:', e.message);
  }
});
