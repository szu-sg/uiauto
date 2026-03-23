/**
 * 金山协作 / WPS 群机器人 Webhook 通知（可选）
 *
 * 在群内添加机器人后，会得到 Webhook 地址，例如：
 * https://xz.wps.cn/api/v1/webhook/send?key=xxxx
 *
 * 文档参考：
 * - https://365.kdocs.cn/3rd/open/documents/app-integration-dev/guide/robot/webhook
 * - https://developer.kdocs.cn/server/notification/woa.html
 *
 * 环境变量：
 * - WPS_NOTIFY_ENABLED=1        开启（默认：未配置 WPS_WEBHOOK_URL 则不发送）
 * - WPS_WEBHOOK_URL=完整URL      机器人 Webhook 地址（含 key 参数）
 * - UIAUTO_PUBLIC_BASE_URL=      前端访问基址，用于消息内「查看报告」链接，如 https://uiauto.example.com:3001
 */

const WEBHOOK = process.env.WPS_WEBHOOK_URL && String(process.env.WPS_WEBHOOK_URL).trim();
const ENABLED =
  WEBHOOK &&
  !['0', 'false', 'no'].includes(String(process.env.WPS_NOTIFY_ENABLED || '1').toLowerCase());

function publicBase() {
  return String(process.env.UIAUTO_PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function runReportUrl(runId) {
  const base = publicBase();
  return base ? `${base}/runs/${runId}` : null;
}

/**
 * POST JSON 到 Webhook；失败只打日志，不抛错
 */
async function postWebhook(body) {
  if (!ENABLED) return;
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      console.warn('[CollaborationNotify] webhook HTTP', r.status, text.slice(0, 200));
    }
  } catch (e) {
    console.warn('[CollaborationNotify] webhook error:', e?.message || e);
  }
}

/**
 * 执行开始（任务已排队，即将克隆仓库）
 * @param {{ runId: number, planName: string, caseCount: number, triggerLabel?: string }} p
 */
export function notifyRunStarted(p) {
  const { runId, planName, caseCount, triggerLabel } = p;
  const url = runReportUrl(runId);
  const lines = [
    '### UIAuto · 测试执行已开始',
    `- **计划**：${planName || '（未命名）'}`,
    `- **Run #${runId}** · 用例数 **${caseCount}**`,
  ];
  if (triggerLabel) lines.push(`- **触发**：${triggerLabel}`);
  if (url) lines.push(`- [查看报告](${url})`);
  const content = lines.join('\n');
  return postWebhook({
    msgtype: 'markdown',
    markdown: { content },
  });
}

/**
 * 执行结束（完成 / 失败 / 取消）
 * @param {{ runId: number, planName: string, status: 'done'|'failed'|'cancelled', passed?: number, total?: number, errorHint?: string }} p
 */
export function notifyRunFinished(p) {
  const { runId, planName, status, passed, total, errorHint } = p;
  const url = runReportUrl(runId);
  let title = '### UIAuto · 测试执行结束';
  if (status === 'done') title = '### UIAuto · 测试执行完成';
  if (status === 'failed') title = '### UIAuto · 测试执行失败';
  if (status === 'cancelled') title = '### UIAuto · 测试已取消';

  const lines = [title, `- **计划**：${planName || '（未命名）'}`, `- **Run #${runId}**`];
  if (status === 'done' && passed != null && total != null) {
    lines.push(`- **结果**：通过 **${passed}** / **${total}**`);
  }
  if (status === 'failed' && errorHint) {
    lines.push(`- **原因**：${String(errorHint).slice(0, 300)}`);
  }
  if (url) lines.push(`- [查看报告](${url})`);

  const content = lines.join('\n');
  return postWebhook({
    msgtype: 'markdown',
    markdown: { content },
  });
}
