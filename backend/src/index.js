import 'dotenv/config';
import './logger.js'; // 将 console 输出同时写入 backend/data/uiauto.log
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { router as plansRouter } from './routes/plans.js';
import { router as runsRouter } from './routes/runs.js';
import { router as githubRouter } from './routes/github.js';
import { loadAll as loadSchedules } from './services/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/plans', plansRouter);
app.use('/api/runs', runsRouter);
app.use('/api/github', githubRouter);

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
app.listen(PORT, HOST, () => {
  console.log(`UIAuto backend http://${HOST}:${PORT}`);
  try {
    loadSchedules();
  } catch (e) {
    console.error('[Scheduler] 启动加载定时任务失败:', e.message);
  }
});
