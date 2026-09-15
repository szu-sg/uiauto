import { Router } from 'express';
import multer from 'multer';
import { importCaseBatch, importCaseBundle, importCaseZip, importMultiSpecZip, validateScript } from '../services/caseImport.js';
import { importSpreadsheetBatch, previewSpreadsheetBatch } from '../services/spreadsheetImport.js';
import {
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
} from '../services/caseService.js';
import {
  listFolderTree,
  createFolder,
  updateFolder,
  deleteFolder,
  moveCasesToFolder,
  copyCase,
} from '../services/caseFolderService.js';
import {
  listCaseVersions,
  restoreCaseVersion,
} from '../services/caseVersionService.js';
import { loadAuth } from '../services/caseWorkspace.js';
import { filterEssentialStorageState } from '../utils/essentialCookies.js';
import { findDuplicateCase } from '../services/caseImportDedup.js';
import { buildCaseMetadata } from '../utils/caseMetadataShape.js';

export const router = Router();

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function extractStorageState(raw) {
  let state = null;
  if (raw?.storageState && typeof raw.storageState === 'object') state = raw.storageState;
  else if (raw?.metadata?.storageState && typeof raw.metadata.storageState === 'object') {
    state = raw.metadata.storageState;
  }
  return filterEssentialStorageState(state);
}

function buildSaveSummary(item, storageState = null) {
  const meta = item.metadata || {};
  const steps = Array.isArray(meta.steps) ? meta.steps : [];
  const cookieCount = storageState?.cookies?.length ?? meta.cookieCount ?? 0;
  const authSaved = meta.hasAuth ?? cookieCount > 0;
  return {
    stepsCount: steps.length,
    cookieCount,
    scriptSaved: Boolean(String(meta.script || '').trim()),
    authSaved,
    scriptPath: item.path,
    authPath: authSaved ? `${item.path}.auth` : null,
  };
}

router.get('/', (req, res) => {
  const items = listCases(req.teamId, {
    q: req.query.q,
    source: req.query.source,
    portability: req.query.portability,
    folder_id: req.query.folder_id,
  });
  res.json(items);
});

router.get('/folders/tree', (req, res) => {
  try {
    res.json(listFolderTree(req.teamId));
  } catch (e) {
    res.status(400).json({ error: e.message || '加载文件夹失败' });
  }
});

router.post('/folders', (req, res) => {
  try {
    const folder = createFolder(req.teamId, req.body || {});
    res.status(201).json(folder);
  } catch (e) {
    res.status(400).json({ error: e.message || '创建文件夹失败' });
  }
});

router.patch('/folders/:folderId', (req, res) => {
  try {
    const folder = updateFolder(req.teamId, Number(req.params.folderId), req.body || {});
    res.json(folder);
  } catch (e) {
    res.status(e.message === '文件夹不存在' ? 404 : 400).json({ error: e.message || '更新文件夹失败' });
  }
});

router.delete('/folders/:folderId', (req, res) => {
  try {
    const moveCasesTo = req.query.move_cases_to ?? req.body?.move_cases_to ?? null;
    const result = deleteFolder(req.teamId, Number(req.params.folderId), { moveCasesTo });
    res.json(result);
  } catch (e) {
    res.status(e.message === '文件夹不存在' ? 404 : 400).json({ error: e.message || '删除文件夹失败' });
  }
});

router.post('/folders/move-cases', (req, res) => {
  try {
    const { case_ids, folder_id } = req.body || {};
    const result = moveCasesToFolder(req.teamId, case_ids, folder_id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || '移动用例失败' });
  }
});

router.post('/:id/copy', (req, res) => {
  try {
    const copied = copyCase(req.teamId, req.user.id, Number(req.params.id), req.body || {});
    res.status(201).json(copied);
  } catch (e) {
    res.status(e.message === '用例不存在' ? 404 : 400).json({ error: e.message || '复制失败' });
  }
});

router.post('/validate', (req, res) => {
  const err = validateScript(req.body?.script);
  if (err) return res.status(400).json({ ok: false, error: err });
  res.json({ ok: true });
});

router.post('/import/spreadsheet/preview', (req, res) => {
  zipUpload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || '文件上传失败' });
    }
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: '请上传 Excel (.xlsx/.xls) 或 CSV 文件' });
      }
      const preview = previewSpreadsheetBatch(req.teamId, req.file.buffer, {
        filename: req.file.originalname,
      });
      res.json(preview);
    } catch (e) {
      res.status(400).json({ error: e.message || '表格预览失败' });
    }
  });
});

router.post('/import/spreadsheet', (req, res) => {
  zipUpload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || '文件上传失败' });
    }
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: '请上传 Excel (.xlsx/.xls) 或 CSV 文件' });
      }
      const folderId = req.body?.folder_id != null && req.body.folder_id !== ''
        ? Number(req.body.folder_id)
        : undefined;
      const priority = req.body?.priority ? String(req.body.priority).trim() : undefined;
      let tags = [];
      if (req.body?.tags) {
        try {
          const parsed = JSON.parse(String(req.body.tags));
          tags = Array.isArray(parsed) ? parsed : [];
        } catch {
          tags = String(req.body.tags).split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
      const result = importSpreadsheetBatch(req.teamId, req.user.id, req.file.buffer, {
        filename: req.file.originalname,
        folder_id: folderId,
        defaults: { priority, tags },
      });
      const status = (result.imported > 0 || result.skipped > 0) ? 201 : 400;
      res.status(status).json(result);
    } catch (e) {
      res.status(400).json({ error: e.message || '表格导入失败' });
    }
  });
});

router.post('/import/batch', (req, res) => {
  try {
    const { folder_id: folderId, defaults, items } = req.body || {};
    const result = importCaseBatch(req.teamId, req.user.id, {
      folder_id: folderId,
      defaults,
      items,
    });
    const status = result.imported > 0 ? 201 : 400;
    res.status(status).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || '批量导入失败' });
  }
});

router.post('/import/zip', (req, res) => {
  zipUpload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || '文件上传失败' });
    }
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: '请上传 ZIP 文件（含 *.spec.ts，可选 *.auth.json、environment.json）' });
      }
      const multi = req.body?.multi === '1' || req.body?.multi === true || req.body?.multi === 'true';
      const name = req.body?.name ? String(req.body.name).trim() : undefined;
      const folderId = req.body?.folder_id != null && req.body.folder_id !== ''
        ? Number(req.body.folder_id)
        : undefined;
      const priority = req.body?.priority ? String(req.body.priority).trim() : undefined;
      const description = req.body?.description != null ? String(req.body.description).trim() : undefined;
      let tags = [];
      if (req.body?.tags) {
        try {
          const parsed = JSON.parse(String(req.body.tags));
          tags = Array.isArray(parsed) ? parsed : [];
        } catch {
          tags = String(req.body.tags).split(',').map((t) => t.trim()).filter(Boolean);
        }
      }

      const zipOptions = {
        name,
        folder_id: folderId,
        priority,
        tags,
        description,
      };

      const result = multi
        ? importMultiSpecZip(req.teamId, req.user.id, req.file.buffer, zipOptions)
        : importCaseZip(req.teamId, req.user.id, req.file.buffer, zipOptions);
      const status = multi
        ? (result.imported > 0 ? 201 : 400)
        : 201;
      res.status(status).json(result);
    } catch (e) {
      res.status(400).json({ error: e.message || 'ZIP 导入失败' });
    }
  });
});

router.post('/import', (req, res) => {
  try {
    const result = importCaseBundle(req.teamId, req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || '导入失败' });
  }
});

router.post('/', (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 必填' });
    }
    const saved = [];
    for (const raw of items) {
      const metaIn = raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {};
      const script = String(metaIn.script || raw.script || '').trim();
      if (!script) continue;

      const source = String(raw.source || metaIn.source || 'recorded').trim() || 'recorded';
      const tags = Array.isArray(raw.tags)
        ? raw.tags
        : (Array.isArray(metaIn.tags) ? metaIn.tags : []);
      const storageState = extractStorageState(raw);
      if (storageState) delete metaIn.storageState;

      const metadata = buildCaseMetadata({
        source,
        script,
        language: metaIn.language,
        steps: metaIn.steps || raw.steps || [],
        module: metaIn.module || raw.module,
        tags,
        scriptStale: metaIn.scriptStale,
        extra: {
          ...metaIn,
          ...(storageState ? {
            cookieCount: storageState.cookies?.length || 0,
            hasAuth: true,
          } : {}),
        },
      });

      const caseName = raw.name != null ? String(raw.name).trim() || '用例' : '用例';
      const upsertRecorded = source === 'recorded' && raw.upsert !== false;
      const dup = upsertRecorded ? findDuplicateCase(req.teamId, caseName, script) : null;

      let record;
      if (dup) {
        record = updateCase(req.teamId, dup.id, {
          name: caseName,
          script,
          description: raw.description,
          priority: raw.priority,
          tags,
          metadata,
          storageState,
          folder_id: raw.folder_id,
        }, { userId: req.user.id });
      } else {
        record = createCase(req.teamId, req.user.id, {
          name: caseName,
          script,
          description: raw.description,
          priority: raw.priority,
          source,
          tags,
          legacy_path: raw.legacy_path || raw.path || null,
          storageState,
          metadata,
          folder_id: raw.folder_id,
        });
      }
      saved.push({
        id: record.id,
        path: record.path,
        name: record.name,
        updated: Boolean(dup),
        summary: buildSaveSummary(record, storageState),
      });
    }
    if (!saved.length) return res.status(400).json({ error: '无有效用例' });
    res.status(201).json({ added: saved.length, items: saved });
  } catch (e) {
    console.error('[cases POST]', e);
    res.status(500).json({ error: e.message || '保存用例失败' });
  }
});

router.get('/:id/versions', (req, res) => {
  try {
    const versions = listCaseVersions(req.teamId, Number(req.params.id));
    res.json(versions);
  } catch (e) {
    res.status(e.message === '用例不存在' ? 404 : 400).json({ error: e.message || '加载版本失败' });
  }
});

router.post('/:id/versions/:version/restore', (req, res) => {
  try {
    const result = restoreCaseVersion(
      req.teamId,
      Number(req.params.id),
      Number(req.params.version),
      { createdBy: String(req.user.id) },
    );
    const item = getCase(req.teamId, Number(req.params.id));
    res.json({ ...result, case: item });
  } catch (e) {
    res.status(e.message === '用例不存在' || e.message === '版本不存在' ? 404 : 400).json({
      error: e.message || '回滚失败',
    });
  }
});

router.get('/:id/auth', (req, res) => {
  const id = Number(req.params.id);
  const item = getCase(req.teamId, id);
  if (!item) return res.status(404).json({ error: '用例不存在' });
  const auth = loadAuth(req.teamId, id);
  if (!auth) return res.status(404).json({ error: '无登录态文件' });
  res.json(auth);
});

router.get('/:id', (req, res) => {
  const item = getCase(req.teamId, Number(req.params.id));
  if (!item) return res.status(404).json({ error: '用例不存在' });
  res.json(item);
});

router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = { ...req.body };
    const inlineStorageState = extractStorageState(req.body || {});
    if (inlineStorageState) patch.storageState = inlineStorageState;
    if (req.body?.login_preference !== undefined) {
      patch.login_preference = req.body.login_preference;
    }
    if (req.body?.clear_auth === true) {
      patch.clear_auth = true;
    }
    const updated = updateCase(req.teamId, id, patch, { userId: req.user.id });
    updated.summary = buildSaveSummary(updated, inlineStorageState);
    res.json(updated);
  } catch (e) {
    res.status(e.message === '用例不存在' ? 404 : 400).json({ error: e.message || '更新失败' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = deleteCase(req.teamId, Number(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(e.message === '用例不存在' ? 404 : 400).json({ error: e.message || '删除失败' });
  }
});
