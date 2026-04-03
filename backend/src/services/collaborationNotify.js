/**
 * 金山协作群机器人 Webhook 通知（可选）
 *
 * - 全局默认：`WPS_WEBHOOK_URL`
 * - 按测试计划：可配置专属 Webhook（发到对应群）与各事件开关
 * - 创建人：展示 **real_name**（中文姓名），正文中使用 `<at user_id="协作UID">姓名</at>`；协作 UID 来自注册时的 `users.uid`
 * - 可选：`WPS_WEBHOOK_MENTIONS=1` 时在 JSON 中附带 `mentioned_list`（部分 Webhook 与 markdown 不兼容时需关闭）
 *
 * 文档：https://365.kdocs.cn/3rd/open/documents/app-integration-dev/guide/robot/webhook
 *
 * 环境变量补充：
 * - WPS_WEBHOOK_MENTIONS=1  是否在 JSON 中带 mentioned_list（部分 Webhook 不支持或与 markdown 不兼容会导致整单被拒，默认不带）
 * - UIAUTO_PUBLIC_BASE_URL  前台根地址（无末尾 /），用于通知里「测试任务」链接，例如 https://uiauto.xxx.com
 *   链接目标为 {UIAUTO_PUBLIC_BASE_URL}/runs/{runId}。配置在运行后端的进程环境中，改后需重启后端。
 */

import { db } from '../db/schema.js';

const WEBHOOK = process.env.WPS_WEBHOOK_URL && String(process.env.WPS_WEBHOOK_URL).trim();
const WEBHOOK_ON =
  WEBHOOK &&
  !['0', 'false', 'no'].includes(String(process.env.WPS_NOTIFY_ENABLED || '1').toLowerCase());

const SEND_MENTIONS = ['1', 'true', 'yes'].includes(String(process.env.WPS_WEBHOOK_MENTIONS || '').toLowerCase());

function publicBase() {
  return String(process.env.UIAUTO_PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function runReportUrl(runId) {
  const base = publicBase();
  return base ? `${base}/runs/${runId}` : null;
}

const BROWSER_LABELS = {
  chromium: 'Chromium',
  chrome: 'Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  webkit: 'WebKit',
};

/** 与执行器一致，用于计算「计划执行条数」 */
const PLAN_BROWSERS_VALID = new Set(['chromium', 'chrome', 'msedge', 'firefox', 'webkit']);

function formatBrowsersFromPlan(plan) {
  if (!plan?.run_browsers_json) return '默认（使用仓库 Playwright 默认 project）';
  try {
    const arr = JSON.parse(plan.run_browsers_json);
    if (!Array.isArray(arr) || arr.length === 0) return '默认（使用仓库 Playwright 默认 project）';
    return arr.map((b) => BROWSER_LABELS[String(b).toLowerCase()] || String(b)).join('、');
  } catch {
    return '默认（使用仓库 Playwright 默认 project）';
  }
}

/** 本次任务计划执行的用例条数（与 executor 展开逻辑一致：多浏览器 = 用例×浏览器） */
function plannedExecutionCountFromPlan(plan) {
  let cases;
  try {
    cases = JSON.parse(plan?.cases_json || '[]');
  } catch {
    return 0;
  }
  if (!Array.isArray(cases) || cases.length === 0) return 0;
  let browsers = [];
  try {
    if (plan?.run_browsers_json) {
      const arr = JSON.parse(plan.run_browsers_json);
      if (Array.isArray(arr) && arr.length) {
        browsers = arr.filter((b) => PLAN_BROWSERS_VALID.has(String(b).toLowerCase()));
      }
    }
  } catch {
    /* ignore */
  }
  if (browsers.length > 0) return cases.length * browsers.length;
  return cases.length;
}

function runCasesTotalCount(runId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM run_cases WHERE run_id = ?').get(Number(runId));
  return row?.n ?? 0;
}

/**
 * 创建人展示：优先中文姓名（real_name），并在正文用 WPS 协作 @ 语法（需 users.uid 为协作侧用户 ID）
 */
function creatorLineForUserId(userId) {
  if (userId == null || userId === '') return '—';
  const row = db.prepare('SELECT real_name, username, uid FROM users WHERE id = ?').get(Number(userId));
  if (!row) return '—';
  const displayRaw = (row.real_name && String(row.real_name).trim()) || (row.username && String(row.username).trim()) || '—';
  const uid = row.uid != null && String(row.uid).trim();
  if (uid) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<at user_id="${esc(uid)}">${esc(displayRaw)}</at>`;
  }
  return displayRaw;
}

/** 报告页 URL；无 UIAUTO_PUBLIC_BASE_URL 时仅显示 Run ID */
function taskLinkBlock(runId) {
  const url = runReportUrl(runId);
  if (url) return `[测试任务](${url})`;
  return `Run #${runId}`;
}

/** 标题里状态色块（WPS Markdown 子集常支持 <font color="#RRGGBB">，客户端不支持时仍显示文字） */
const NOTIFY_TITLE_STYLES = {
  started: { label: '任务开始', color: '#2563eb' },
  done: { label: '任务完成', color: '#16a34a' },
  failed: { label: '任务失败', color: '#dc2626' },
  cancelled: { label: '任务取消', color: '#ea580c' },
  end: { label: '任务结束', color: '#64748b' },
};

function formatTitleWithStatus(baseTitle, statusKey) {
  const s = NOTIFY_TITLE_STYLES[statusKey] || NOTIFY_TITLE_STYLES.end;
  return `${baseTitle} · <font color="${s.color}">${s.label}</font>`;
}

/**
 * WPS Markdown：段落之间用双换行，标签与内容用单换行
 * @param {string} heading 已含 ## 内层勿重复
 * @param {Array<[string, string]>} rows [标签, 内容]
 */
function formatNotifyCard(heading, rows) {
  const chunks = [`## ${heading}`];
  for (const [label, text] of rows) {
    chunks.push(`**${label}**\n${text}`);
  }
  return chunks.join('\n\n');
}

/** 计划级 Webhook 优先，否则用环境变量默认地址 */
function resolveWebhookUrl(plan) {
  const u = plan && plan.notify_webhook_url && String(plan.notify_webhook_url).trim();
  if (u) return u;
  if (WEBHOOK_ON && WEBHOOK) return WEBHOOK;
  return '';
}

function planFlagOn(plan, col) {
  if (!plan || plan[col] === null || plan[col] === undefined) return true;
  return Number(plan[col]) !== 0;
}

/**
 * 根据 UIAuto 用户 id 取金山协作 @ 用的 openId（存于 users.uid）
 * @param {number|null|undefined} userId
 * @returns {string[]}
 */
export function mentionIdsForCollaborationUser(userId) {
  if (userId == null || userId === '') return [];
  const row = db.prepare('SELECT uid FROM users WHERE id = ?').get(Number(userId));
  const u = row?.uid != null && String(row.uid).trim();
  return u ? [String(row.uid).trim()] : [];
}

/** 运行记录上的触发人 → @ uid；无则回退计划负责人 */
export function mentionIdsForRun(runId, plan) {
  const run = db.prepare('SELECT triggered_by_user_id FROM runs WHERE id = ?').get(Number(runId));
  const uid = run?.triggered_by_user_id != null ? run.triggered_by_user_id : plan?.user_id;
  return mentionIdsForCollaborationUser(uid);
}

function buildWebhookBody(markdownContent, mentionUserIds) {
  // WPS 365 直连 Webhook 要求 markdown.text，不是企业微信的 markdown.content（否则返回 Markdown message is empty）
  const body = {
    msgtype: 'markdown',
    markdown: { text: markdownContent },
  };
  if (SEND_MENTIONS && mentionUserIds && mentionUserIds.length) {
    body.mentioned_list = mentionUserIds;
  }
  return body;
}

async function postWebhook(url, body) {
  if (!url) return;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      console.warn('[CollaborationNotify] Webhook 请求失败 HTTP', r.status, text.slice(0, 400));
    } else {
      console.log('[CollaborationNotify] Webhook 已发送 HTTP', r.status, text ? text.slice(0, 120) : '');
    }
  } catch (e) {
    console.warn('[CollaborationNotify] Webhook 网络错误:', e?.message || e);
  }
}

function startedMarkdown(p) {
  const { runId, plan, triggeredUserId, scheduleTriggered } = p;
  let creator = creatorLineForUserId(triggeredUserId);
  if (scheduleTriggered && creator !== '—') creator = `${creator}（定时触发）`;
  const browsers = formatBrowsersFromPlan(plan);
  const planned = plannedExecutionCountFromPlan(plan);
  const rows = [
    ['任务链接', taskLinkBlock(runId)],
    ['创建人', creator],
    ['执行设备', browsers],
    ['执行用例数', `共计划执行 **${planned}** 条用例`],
  ];
  const title = formatTitleWithStatus('UI自动化测试', 'started');
  return formatNotifyCard(title, rows);
}

function finishedMarkdown(p) {
  const { runId, plan, status, passed, total, errorHint } = p;
  const statusKey =
    status === 'done' ? 'done' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'end';
  const title = formatTitleWithStatus('UI自动化测试', statusKey);

  const run = db.prepare('SELECT triggered_by_user_id FROM runs WHERE id = ?').get(Number(runId));
  const creator = creatorLineForUserId(run?.triggered_by_user_id);
  const browsers = formatBrowsersFromPlan(plan);
  const caseTotal = runCasesTotalCount(runId);

  const rows = [
    ['任务链接', taskLinkBlock(runId)],
    ['创建人', creator],
    ['执行设备', browsers],
    ['执行用例数', `共计划执行 **${caseTotal}** 条用例`],
  ];

  if (status === 'done' && passed != null && total != null) {
    rows.push(['执行结果', `通过 **${passed}** / **${total}** 个用例`]);
  }
  if (status === 'failed' && errorHint) {
    rows.push(['失败原因', String(errorHint).slice(0, 400)]);
  }
  if (status === 'cancelled') {
    rows.push(['状态', '任务已取消']);
  }

  return formatNotifyCard(title, rows);
}

/**
 * 创建测试任务后（已入队，即将执行）
 * @param {{ runId, plan, triggeredUserId?: number|null, scheduleTriggered?: boolean, mentionUserIds?: string[] }} p
 */
export function notifyRunStarted(p) {
  const { plan, mentionUserIds = [], ...rest } = p;
  const url = resolveWebhookUrl(plan);
  if (!url) {
    console.log(
      '[CollaborationNotify] 未发送「任务已创建」：未配置 Webhook。请在计划详情填写「群机器人 Webhook」或在服务器设置环境变量 WPS_WEBHOOK_URL。'
    );
    return Promise.resolve();
  }
  if (!planFlagOn(plan, 'notify_on_created')) {
    console.log('[CollaborationNotify] 未发送「任务已创建」：该计划已关闭「任务创建时通知」。');
    return Promise.resolve();
  }
  return postWebhook(url, buildWebhookBody(startedMarkdown({ ...rest, plan }), mentionUserIds));
}

/**
 * 执行结束（完成 / 失败 / 取消）
 * @param {{ runId, plan, status, passed?, total?, errorHint?, mentionUserIds?: string[] }} p
 */
export function notifyRunFinished(p) {
  const { plan, status, mentionUserIds = [], ...rest } = p;
  const url = resolveWebhookUrl(plan);
  if (!url) {
    console.log('[CollaborationNotify] 未发送「执行结束」：未配置 Webhook（计划或 WPS_WEBHOOK_URL）。');
    return Promise.resolve();
  }
  if (status === 'done' && !planFlagOn(plan, 'notify_on_success')) return Promise.resolve();
  if ((status === 'failed' || status === 'cancelled') && !planFlagOn(plan, 'notify_on_failure')) {
    return Promise.resolve();
  }
  return postWebhook(url, buildWebhookBody(finishedMarkdown({ status, ...rest, plan }), mentionUserIds));
}
