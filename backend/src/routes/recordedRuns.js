import { Router } from 'express';
import {
  enqueueRecordedRun,
  getRecordedRun,
  listRecordedRuns,
  cancelRecordedRun,
  getRunningRecordedRunId,
} from '../services/recordedRunner.js';
import { db } from '../db/schema.js';
import { resolveRecordedStorageState } from '../services/recordedCases.js';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';
import { resolveExecutionEnvironment } from '../services/resolveEnvironment.js';

export const router = Router();

function parseCaseRow(row) {
  if (!row) return null;
  let metadata = null;
  if (row.metadata_json) {
    try { metadata = JSON.parse(row.metadata_json); } catch (_) {}
  }
  return { ...row, metadata };
}

router.get('/', (req, res) => {
  const caseCatalogId = req.query.caseId ? Number(req.query.caseId) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const items = listRecordedRuns(req.teamId, { caseCatalogId, limit });
  res.json(items);
});

router.get('/status/active', (req, res) => {
  res.json({ runId: getRunningRecordedRunId() });
});

router.get('/:id', (req, res) => {
  const run = getRecordedRun(req.teamId, req.params.id);
  if (!run) return res.status(404).json({ error: '试跑记录不存在' });
  res.json(run);
});

router.post('/', (req, res) => {
  try {
    const {
      caseId,
      casePath,
      caseName,
      script,
      environmentId,
      planId,
      storageState,
    } = req.body || {};

    let catalogId = caseId ? Number(caseId) : null;
    let pathVal = casePath ? String(casePath).trim() : '';
    let nameVal = caseName ? String(caseName).trim() : null;
    let scriptVal = script ? String(script) : '';
    let storageStateVal = filterEssentialStorageState(
      storageState && typeof storageState === 'object' ? storageState : null,
    );
    let caseRow = null;

    if (catalogId) {
      caseRow = parseCaseRow(
        db.prepare('SELECT * FROM cases WHERE id = ? AND team_id = ? AND status = ?').get(
          catalogId,
          req.teamId,
          'active',
        ),
      );
      if (!caseRow) return res.status(404).json({ error: '用例不存在' });
      pathVal = caseRow.legacy_path || `${req.teamId}/${caseRow.id}/${caseRow.script_path || 'case.spec.ts'}`;
      nameVal = caseRow.name || nameVal;
      if (!scriptVal && caseRow.metadata?.script) scriptVal = caseRow.metadata.script;
      if (!storageStateVal && caseRow.metadata?.storageState) {
        storageStateVal = filterEssentialStorageState(caseRow.metadata.storageState);
      }
    }

    if (!pathVal) return res.status(400).json({ error: 'casePath 必填' });
    if (!scriptVal.trim()) return res.status(400).json({ error: 'script 必填' });

    storageStateVal = resolveRecordedStorageState(pathVal, storageStateVal);

    let plan = null;
    if (planId != null && planId !== '') {
      plan = db.prepare('SELECT * FROM plans WHERE id = ? AND team_id = ?').get(Number(planId), req.teamId);
    }

    const envResolved = resolveExecutionEnvironment({
      caseRow,
      plan,
      overrideEnvId: environmentId,
    });

    const runId = enqueueRecordedRun({
      userId: req.user.id,
      teamId: req.teamId,
      caseCatalogId: catalogId,
      casePath: pathVal,
      caseName: nameVal,
      script: scriptVal,
      environmentId: envResolved.envId,
      environmentSnapshot: envResolved.snapshot,
      storageState: storageStateVal,
    });

    res.status(202).json({ id: runId, status: 'pending' });
  } catch (e) {
    res.status(400).json({ error: e.message || '试跑启动失败' });
  }
});

router.post('/:id/cancel', (req, res) => {
  const run = getRecordedRun(req.teamId, req.params.id);
  if (!run) return res.status(404).json({ error: '试跑记录不存在' });
  if (run.status !== 'running' && run.status !== 'pending') {
    return res.status(400).json({ error: '该试跑已结束' });
  }
  const ok = cancelRecordedRun(run.id);
  if (ok) {
    db.prepare(
      "UPDATE recorded_runs SET status = 'cancelled', finished_at = datetime('now', '+8 hours'), error_message = '已取消' WHERE id = ?",
    ).run(run.id);
  }
  res.json({ ok: true, cancelled: ok });
});
