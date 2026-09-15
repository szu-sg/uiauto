import { useEffect, useMemo, useState } from 'react';
import CopyButton from '../ui/CopyButton';
import { LOCAL_RUNNER_URL } from '../../config/localRunner';
import { useLocalRunner } from '../../context/LocalRunnerContext';
import { authFetch } from '../../authApi';
import { downloadLocalRunnerZip } from '../../utils/localRunnerDownload';
import { useToast } from '../../context/ToastContext';
import { detectPlatform, localRunnerStartHint } from '../../utils/detectPlatform';

const REASON_TEXT = {
  run: '一键运行需要本机运行器，按下方两步配置即可（仅需一次）。',
  banner: '本机运行器未启动，完成下方配置后即可调试用例。',
  manual: '本机已安装 Node.js 时，只需下载运行器并启动。',
};

export default function LocalRunnerSetupWizard({ open, reason = 'manual', onClose }) {
  const { showToast } = useToast();
  const { ready, refresh } = useLocalRunner();
  const [info, setInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const platform = useMemo(() => detectPlatform(), []);
  const hint = useMemo(() => localRunnerStartHint(platform), [platform]);

  useEffect(() => {
    if (!open) return;
    authFetch('/api/local-runner/info')
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
    setDownloaded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || ready) return undefined;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [open, ready, refresh]);

  useEffect(() => {
    if (!open || !ready) return;
    showToast('本机运行器已连接，可以一键运行了');
    const t = window.setTimeout(() => onClose?.(), 800);
    return () => window.clearTimeout(t);
  }, [open, ready, onClose, showToast]);

  const handleDownload = async () => {
    if (!info?.available) {
      showToast('运行器包暂不可用，请联系管理员', 3500);
      return;
    }
    setDownloading(true);
    try {
      await downloadLocalRunnerZip(`uiauto-local-runner-v${info.version}.zip`);
      setDownloaded(true);
      showToast('已开始下载，解压后按下方说明启动');
    } catch (e) {
      showToast(e.message || '下载失败', 3500);
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--wide lr-wizard lr-wizard--simple"
        role="dialog"
        aria-labelledby="lr-wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lr-wizard-title" className="ui-modal__title">本机运行器配置</h2>
        <p className="lr-wizard__lead">{REASON_TEXT[reason] || REASON_TEXT.manual}</p>

        <div className={`local-runner-status${ready ? ' local-runner-status--ok' : ''}`}>
          <span className="local-runner-status__dot" aria-hidden />
          <div>
            <strong>{ready ? '已连接，可以一键运行' : '等待本机运行器连接'}</strong>
            <p>{LOCAL_RUNNER_URL}</p>
          </div>
        </div>

        <section className="lr-wizard-simple__section">
          <h3>1. 下载运行器</h3>
          <p>将 ZIP 解压到任意目录（如桌面或 <code>~/uiauto-runner</code>）。</p>
          <div className="lr-wizard__actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={downloading}
              onClick={handleDownload}
            >
              {downloading ? '打包中…' : `下载运行器 v${info?.version || '1.0.0'}`}
            </button>
            {downloaded && <span className="lr-wizard__done-tag">已下载</span>}
          </div>
        </section>

        <section className="lr-wizard-simple__section">
          <h3>2. 启动运行器（{hint.title}）</h3>
          <ol className="lr-wizard-simple__steps">
            {hint.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="local-runner-setup__cmd">
            <pre className="local-runner-setup__code">{hint.command}</pre>
            <CopyButton text={hint.command} />
          </div>
          <p className="local-runner-setup__hint">
            已安装 Node.js 时，首次启动会自动安装 Playwright 与 Chromium，无需单独执行 install。
          </p>
          <div className="lr-wizard__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              重新检测连接
            </button>
          </div>
        </section>

        <div className="ui-modal__actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            {ready ? '完成' : '稍后配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
