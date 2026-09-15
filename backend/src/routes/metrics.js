import { Router } from 'express';
import { db } from '../db/schema.js';

export const router = Router();

function parseCaseCount(casesJson) {
  try {
    return JSON.parse(casesJson || '[]').length;
  } catch {
    return 0;
  }
}

function bjDateKey(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
    ? new Date(s.replace(' ', 'T') + '+08:00')
    : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function last7DayKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

router.get('/', (req, res) => {
  const teamId = req.teamId;

  const plans = db.prepare(
    'SELECT id, name, enabled, cases_json, created_at FROM plans WHERE team_id = ?',
  ).all(teamId);

  const runs = db.prepare(
    `SELECT r.id, r.status, r.created_at, r.plan_id, p.name AS plan_name,
      (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id AND status = 'passed') AS passed_count,
      (SELECT COUNT(*) FROM run_cases WHERE run_id = r.id) AS total_cases
     FROM runs r
     INNER JOIN plans p ON r.plan_id = p.id
     WHERE p.team_id = ?
     ORDER BY r.created_at DESC`,
  ).all(teamId);

  const caseCount = db.prepare(
    "SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND status = 'active'",
  ).get(teamId)?.n ?? 0;

  const recordedCaseCount = db.prepare(
    "SELECT COUNT(*) AS n FROM cases WHERE team_id = ? AND status = 'active' AND source = 'recorded'",
  ).get(teamId)?.n ?? 0;

  const envCount = db.prepare(
    'SELECT COUNT(*) AS n FROM execution_environments WHERE team_id = ?',
  ).get(teamId)?.n ?? 0;

  const enabledPlans = plans.filter((p) => p.enabled !== 0 && p.enabled !== false).length;
  const planCaseTotal = plans.reduce((sum, p) => sum + parseCaseCount(p.cases_json), 0);

  const runningRuns = runs.filter((r) => r.status === 'running' || r.status === 'pending').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const doneRuns = runs.filter((r) => r.status === 'done');

  let avgPassRate = 0;
  if (doneRuns.length > 0) {
    const sum = doneRuns.reduce((acc, r) => {
      const total = Number(r.total_cases || 0);
      const passed = Number(r.passed_count || 0);
      if (total <= 0) return acc;
      return acc + (passed / total) * 100;
    }, 0);
    avgPassRate = Math.round(sum / doneRuns.length);
  }

  const dayKeys = last7DayKeys();
  const runsByDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  runs.forEach((r) => {
    const key = bjDateKey(r.created_at);
    if (key && key in runsByDay) runsByDay[key] += 1;
  });
  const trend7d = dayKeys.map((date) => ({ date, count: runsByDay[date] }));

  const planRunMap = new Map();
  runs.forEach((r) => {
    const id = r.plan_id;
    if (!planRunMap.has(id)) {
      planRunMap.set(id, {
        planId: id,
        planName: r.plan_name || `计划 #${id}`,
        total: 0,
        failed: 0,
        done: 0,
      });
    }
    const entry = planRunMap.get(id);
    entry.total += 1;
    if (r.status === 'failed') entry.failed += 1;
    if (r.status === 'done') entry.done += 1;
  });

  const topPlans = [...planRunMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const runsLast7Days = runs.filter((r) => {
    const key = bjDateKey(r.created_at);
    if (!key) return false;
    const t = new Date(`${key}T00:00:00+08:00`).getTime();
    return t >= cutoff7d - 24 * 60 * 60 * 1000;
  }).length;

  res.json({
    plans: plans.length,
    enabledPlans,
    planCaseTotal,
    catalogCases: caseCount,
    recordedCases: recordedCaseCount,
    environments: envCount,
    runs: runs.length,
    runningRuns,
    failedRuns,
    doneRuns: doneRuns.length,
    avgPassRate,
    runsLast7Days,
    trend7d,
    topPlans,
    recentRuns: runs.slice(0, 8).map((r) => ({
      id: r.id,
      planName: r.plan_name,
      status: r.status,
      createdAt: r.created_at,
      passedCount: r.passed_count,
      totalCases: r.total_cases,
    })),
  });
});
