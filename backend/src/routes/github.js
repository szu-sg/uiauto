import { Router } from 'express';
import { listSpecFiles, getCaseDisplayNames } from '../services/github.js';

export const router = Router();

const GITHUB_TIMEOUT_MS = 20000;

router.get('/specs', async (req, res) => {
  const { owner, repo, branch, path: dir, token } = req.query;
  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo required' });
  }
  const ref = branch || 'main';
  console.log('[GitHub] 拉取用例: owner=%s repo=%s branch=%s', owner, repo, ref);
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求 GitHub 超时（约 20 秒），请检查网络或代理')), GITHUB_TIMEOUT_MS)
    );
    const files = await Promise.race([
      listSpecFiles({
        owner,
        repo,
        branch: ref,
        path: dir || '',
        token: token || undefined,
      }),
      timeoutPromise,
    ]);
    console.log('[GitHub] 成功: 共 %d 个用例', files.length);
    if (files.length > 0) console.log('[GitHub] 用例: %s', files.map((f) => f.path).join(', '));
    res.json(files);
  } catch (err) {
    console.error('[GitHub] 失败:', err.message);
    res.status(err.status || 500).json({ error: err.message || '拉取失败' });
  }
});

/** 批量获取用例显示名（从脚本解析 test 标题，失败则文件名兜底） */
router.post('/case-names', async (req, res) => {
  const { owner, repo, branch, paths, token } = req.body || {};
  if (!owner || !repo || !Array.isArray(paths)) {
    return res.status(400).json({ error: 'owner, repo, paths 必填' });
  }
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求超时')), GITHUB_TIMEOUT_MS)
    );
    const names = await Promise.race([
      getCaseDisplayNames({
        owner,
        repo,
        branch: branch || 'main',
        paths: paths.filter(Boolean),
        token: token || undefined,
      }),
      timeoutPromise,
    ]);
    res.json(names);
  } catch (err) {
    console.error('[GitHub] case-names 失败:', err.message);
    res.status(500).json({ error: err.message || '获取用例名失败' });
  }
});
