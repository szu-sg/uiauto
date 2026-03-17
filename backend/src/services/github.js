import { Octokit } from 'octokit';
import path from 'path';

const SPEC_PATTERNS = ['.spec.ts', '.spec.js', '.spec.mjs', '.test.ts', '.test.js', '_spec.ts', '_spec.js'];

/** 从文件路径得到兜底显示名：去掉扩展名，如 tests/demo.spec.ts -> demo */
function fallbackDisplayNameFromPath(filePath) {
  const base = path.basename(filePath || '');
  const withoutExt = SPEC_PATTERNS.reduce((s, ext) => (s.endsWith(ext) ? s.slice(0, -ext.length) : s), base);
  return withoutExt || base || filePath || '未命名用例';
}

/**
 * 从脚本内容中解析第一个 test('...') 或 test.describe('...') 的标题；解析不到则用文件名兜底，再不行用「未命名用例 (path)」。
 */
function parseFirstTestTitle(content, filePath) {
  if (!content || typeof content !== 'string') return fallbackDisplayNameFromPath(filePath);
  const trimmed = content.trim();
  // test('...') / test("...") / test(`...`) 或 test.describe('...')
  const patterns = [
    /test\s*\.\s*describe\s*\(\s*['"`]([^'"`]+)['"`]/,
    /test\s*\(\s*['"`]([^'"`]+)['"`]/,
    /it\s*\(\s*['"`]([^'"`]+)['"`]/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1].trim();
  }
  const fromPath = fallbackDisplayNameFromPath(filePath);
  if (fromPath !== '未命名用例') return fromPath;
  return `未命名用例 (${filePath || '?'})`;
}

/**
 * 从 GitHub 获取单个文件原始内容（UTF-8 字符串）。
 */
async function getFileContent(octokit, owner, repo, ref, filePath) {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, ref, path: filePath });
  if (data.type !== 'file' || !data.content) return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

const DESCRIPTION_MAX_LEN = 200;

/**
 * 从脚本内容解析用例元数据：名称、描述（首段 JSDoc/块注释）、标签（tag 配置与 @xxx）。
 * @param {string} content - 文件内容
 * @param {string} filePath - 用例路径
 * @returns {{ name: string, description?: string, tags?: string[] }}
 */
export function parseCaseMetadata(content, filePath) {
  const name = parseFirstTestTitle(content, filePath);
  const result = { name };

  if (!content || typeof content !== 'string') return result;

  const trimmed = content.trim();

  // description: 第一个 /** ... */ 或 /* ... */
  const blockComment = trimmed.match(/\/\*\*?([\s\S]*?)\*\//);
  if (blockComment && blockComment[1]) {
    const desc = blockComment[1]
      .replace(/^\s*\*\s?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, DESCRIPTION_MAX_LEN);
    if (desc) result.description = desc;
  }

  // tags: tag: ['@a','@b'] / tag: "@smoke" / 标题中的 @word
  const tagsSet = new Set();

  const tagArrayMatch = trimmed.match(/tag\s*:\s*\[([^\]]*)\]/);
  if (tagArrayMatch && tagArrayMatch[1]) {
    tagArrayMatch[1].split(',').forEach((s) => {
      const t = s.replace(/['"`]/g, '').trim();
      if (t) tagsSet.add(t);
    });
  }
  const tagSingleMatch = trimmed.match(/tag\s*:\s*['"`]([^'"`]+)['"`]/);
  if (tagSingleMatch && tagSingleMatch[1]) tagsSet.add(tagSingleMatch[1].trim());
  const atWords = trimmed.match(/@\w+/g);
  if (atWords) atWords.forEach((w) => tagsSet.add(w));

  if (tagsSet.size) result.tags = [...tagsSet];

  return result;
}

/**
 * 批量获取用例元数据（名称、描述、标签）。
 * @param {object} opts - { owner, repo, branch, paths: string[], token? }
 * @returns {Promise<Record<string, { name: string, description?: string, tags?: string[] }>>}
 */
export async function getCaseMetadata(opts) {
  const { owner, repo, branch, paths, token } = opts;
  if (!owner || !repo || !Array.isArray(paths) || paths.length === 0) {
    return {};
  }
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();
  let ref = branch || 'main';
  if (!ref) {
    try {
      ref = await getDefaultBranch(octokit, owner, repo);
    } catch (_) {
      ref = 'main';
    }
  }
  const result = {};
  for (const filePath of paths) {
    try {
      const content = await getFileContent(octokit, owner, repo, ref, filePath);
      result[filePath] = parseCaseMetadata(content || '', filePath);
    } catch (err) {
      result[filePath] = { name: fallbackDisplayNameFromPath(filePath) };
    }
  }
  return result;
}

/**
 * 批量获取用例显示名：从脚本解析 test 标题，解析不到则用文件名兜底，再不行用「未命名用例 (path)」。
 * @param {object} opts - { owner, repo, branch, paths: string[], token? }
 * @returns {Promise<Record<string, string>>} path -> displayName
 */
export async function getCaseDisplayNames(opts) {
  const { owner, repo, branch, paths, token } = opts;
  if (!owner || !repo || !Array.isArray(paths) || paths.length === 0) {
    return {};
  }
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();
  let ref = branch || 'main';
  if (!ref) {
    try {
      ref = await getDefaultBranch(octokit, owner, repo);
    } catch (_) {
      ref = 'main';
    }
  }
  const result = {};
  for (const filePath of paths) {
    try {
      const content = await getFileContent(octokit, owner, repo, ref, filePath);
      result[filePath] = parseFirstTestTitle(content, filePath);
    } catch (err) {
      result[filePath] = fallbackDisplayNameFromPath(filePath);
    }
  }
  return result;
}

function isSpecFile(name) {
  return SPEC_PATTERNS.some((p) => name.endsWith(p));
}

/** Get default branch (e.g. main/master) for the repo. */
async function getDefaultBranch(octokit, owner, repo) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

/**
 * List spec files in repo (one level or recursive via tree).
 * @param {object} opts - { owner, repo, branch, path, token }
 * @returns {Promise<{ path: string, name: string }[]>}
 */
export async function listSpecFiles(opts) {
  const { owner, repo, branch, path: dir = '', token } = opts;
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();

  let ref = branch;
  if (!ref) {
    try {
      ref = await getDefaultBranch(octokit, owner, repo);
      console.log('[GitHub] 使用默认分支: %s', ref);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      throw new Error(msg || '无法获取仓库信息，请检查 owner/repo 或 Token');
    }
  }

  // 根目录必须省略 path，否则 GitHub API 可能返回 404（不能传 '.' 或 ''）
  const requestParams = { owner, repo, ref };
  if (dir && String(dir).trim()) requestParams.path = dir.trim();

  try {
    const { data } = await octokit.rest.repos.getContent(requestParams);

    if (Array.isArray(data)) {
      const files = [];
      for (const entry of data) {
        if (entry.type === 'file' && isSpecFile(entry.name)) {
          files.push({ path: entry.path, name: entry.name });
        }
        if (entry.type === 'dir') {
          const sub = await listSpecFilesRecurse(octokit, owner, repo, ref, entry.path);
          files.push(...sub);
        }
      }
      return files;
    }
    if (data.type === 'file' && isSpecFile(data.name)) {
      return [{ path: data.path, name: data.name }];
    }
    return [];
  } catch (err) {
    const status = err.status ?? err.response?.status;
    if (status === 404 && ref === (branch || 'main')) {
      try {
        const defaultRef = await getDefaultBranch(octokit, owner, repo);
        console.log('[GitHub] 分支 %s 不存在，改用默认分支: %s', ref, defaultRef);
        if (defaultRef !== ref) {
          return listSpecFiles({ ...opts, branch: defaultRef });
        }
      } catch (e2) {
        console.error('[GitHub] 获取默认分支失败:', e2.message);
      }
    }
    if (status === 404) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`路径或分支不存在 (${ref}): ${msg}`);
    }
    if (status === 403) {
      const msg = err.response?.data?.message || err.message;
      const isQuota = /quota|rate limit|exhausted/i.test(msg);
      throw new Error(isQuota
        ? 'GitHub API 配额已用尽（未登录约 60 次/小时）。请在「新建计划」页填写 GitHub Token 后重试。'
        : `访问被拒绝 (403): ${msg}。私有仓库请填写 GitHub Token。`);
    }
    const msg = err.response?.data?.message || err.message;
    throw new Error(msg || '拉取失败');
  }
}

async function listSpecFilesRecurse(octokit, owner, repo, ref, dir) {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, ref, path: dir });
  if (!Array.isArray(data)) return [];
  const files = [];
  for (const entry of data) {
    if (entry.type === 'file' && isSpecFile(entry.name)) {
      files.push({ path: entry.path, name: entry.name });
    }
    if (entry.type === 'dir') {
      const sub = await listSpecFilesRecurse(octokit, owner, repo, ref, entry.path);
      files.push(...sub);
    }
  }
  return files;
}
