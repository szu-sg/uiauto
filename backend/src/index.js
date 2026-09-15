import './loadEnv.js';

import path from 'path';

import { fileURLToPath } from 'url';

import http from 'http';



const __dirnameRoot = path.dirname(fileURLToPath(import.meta.url));



import './logger.js';

import express from 'express';

import cors from 'cors';

import fs from 'fs';

import jwt from 'jsonwebtoken';

import { WebSocketServer } from 'ws';

import { router as plansRouter } from './routes/plans.js';

import { router as runsRouter } from './routes/runs.js';

import { router as authRouter } from './routes/auth.js';

import { router as casesRouter } from './routes/cases.js';

import { router as environmentsRouter } from './routes/environments.js';

import { router as recordedRunsRouter } from './routes/recordedRuns.js';
import { router as recorderRouter } from './routes/recorder.js';
import { migrateCatalogToCases } from './services/caseService.js';
import { ensureWorkspaceShell } from './services/caseWorkspace.js';

import { router as extensionRouter } from './routes/extension.js';
import { router as localRunnerRouter } from './routes/localRunner.js';
import { router as metricsRouter } from './routes/metrics.js';
import { router as teamsRouter } from './routes/teams.js';
import { router as usersRouter } from './routes/users.js';

import { requireAuth } from './middleware/auth.js';
import { attachTeam, enforceTeamPermissions } from './middleware/teamAuth.js';
import { requireTeamContext } from './middleware/platformAuth.js';
import { router as adminTeamsRouter } from './routes/adminTeams.js';

import { isAuthDisabled, devAuthUser } from './middleware/devAuth.js';

import { loadAll as loadSchedules } from './services/scheduler.js';

import { attachRecorderClient } from './services/recorderHub.js';

import { db as _startupDb } from './db/schema.js';



const JWT_SECRET = process.env.JWT_SECRET || 'uiauto-dev-secret-change-in-production';



const __dirname = __dirnameRoot;

const app = express();

app.use(cors());

app.use(express.json({ limit: '5mb' }));



app.use('/api/auth', authRouter);

app.use('/api/teams', requireAuth, teamsRouter);

app.use('/api/admin', requireAuth, attachTeam, adminTeamsRouter);

app.use('/api/users', requireAuth, attachTeam, usersRouter);

const teamApi = [requireAuth, attachTeam, requireTeamContext, enforceTeamPermissions];

app.use('/api/plans', ...teamApi, plansRouter);

app.use('/api/runs', ...teamApi, runsRouter);

app.use('/api/environments', ...teamApi, environmentsRouter);

app.use('/api/cases', ...teamApi, casesRouter);

app.use('/api/recorded-runs', ...teamApi, recordedRunsRouter);

app.use('/api/recorder', ...teamApi, recorderRouter);

app.use('/api/extension', extensionRouter);

app.use('/api/local-runner', localRunnerRouter);

app.use('/api/metrics', ...teamApi, metricsRouter);



const resultsDir = path.join(__dirname, '../results');

app.use('/results', express.static(resultsDir));



const publicDir = path.join(__dirname, '../public');

app.use(express.static(publicDir));

app.get('*', (req, res, next) => {

  if (req.path.startsWith('/api') || req.path.startsWith('/results') || req.path.startsWith('/ws')) return next();

  const index = path.join(publicDir, 'index.html');

  fs.existsSync(index) ? res.sendFile(index) : next();

});



app.use((err, req, res, next) => {

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大（多为 Cookie 数据），请重试或联系管理员' });
  }

  console.error('[Error]', err.message || err);

  res.status(500).json({ error: err.message || '内部服务错误' });

});



process.on('uncaughtException', (err) => {

  console.error('[uncaughtException]', err.message || err);

});

process.on('unhandledRejection', (reason) => {

  console.error('[unhandledRejection]', reason);

});



const PORT = process.env.PORT || 3001;

const HOST = process.env.HOST || '0.0.0.0';



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



(function recoverStaleRecordedRuns() {

  try {

    const stale = _startupDb.prepare(

      "SELECT id FROM recorded_runs WHERE status IN ('running', 'pending')"

    ).all();

    if (stale.length === 0) return;

    const jobsDir = path.join(__dirnameRoot, '../data/recorded-run-jobs');

    const msg = '后端已重启，试跑中断，请重新试跑。';

    let recovered = 0;

    let skipped = 0;

    for (const r of stale) {

      let alive = false;

      try {

        const pid = Number(fs.readFileSync(path.join(jobsDir, `${r.id}.pid`), 'utf8').trim());

        alive = Number.isFinite(pid) && pid > 0 && (() => {

          try { process.kill(pid, 0); return true; } catch { return false; }

        })();

      } catch (_) {}

      if (alive) {

        skipped += 1;

        continue;

      }

      _startupDb.prepare(

        "UPDATE recorded_runs SET status = 'failed', finished_at = datetime('now', '+8 hours'), error_message = ? WHERE id = ?"

      ).run(msg, r.id);

      recovered += 1;

    }

    if (recovered > 0) {

      console.log(`[Startup] 已将 ${recovered} 条中断的试跑记录标记为失败`);

    }

    if (skipped > 0) {

      console.log(`[Startup] ${skipped} 条试跑仍在后台进程中运行，已跳过恢复`);

    }

  } catch (e) {

    console.error('[Startup] 恢复 stale recorded runs 失败:', e.message);

  }

}());



const server = http.createServer(app);



const wss = new WebSocketServer({ server, path: '/ws/recorder' });



wss.on('connection', (ws, req) => {

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  const sessionId = url.searchParams.get('session') || '';

  const role = url.searchParams.get('role') === 'ext' ? 'ext' : 'ui';

  const connectKey = url.searchParams.get('key') || '';



  let userId;

  if (role === 'ui') {

    if (isAuthDisabled()) {

      userId = devAuthUser().id;

    } else {

      const token = url.searchParams.get('token') || '';

      try {

        const payload = jwt.verify(token, JWT_SECRET);

        userId = payload.sub;

      } catch (_) {

        ws.close(4001, 'unauthorized');

        return;

      }

    }

  }



  attachRecorderClient(ws, { sessionId, role, connectKey, userId });

});



server.listen(PORT, HOST, () => {
  try {
    migrateCatalogToCases();
    ensureWorkspaceShell();
  } catch (e) { console.warn('[Startup] cases workspace:', e.message); }

  console.log(`UIAuto backend http://${HOST}:${PORT}`);

  try {

    loadSchedules();

  } catch (e) {

    console.error('[Scheduler] 启动加载定时任务失败:', e.message);

  }

});

