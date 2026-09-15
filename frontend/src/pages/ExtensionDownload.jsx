import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import { authFetch } from '../authApi';
import { useToast } from '../context/ToastContext';
import { downloadExtensionZip } from '../utils/extensionDownload';
import { useTeamWrite } from '../hooks/useTeamWrite';

export default function ExtensionDownload() {
  const { showToast } = useToast();
  const canWrite = useTeamWrite();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    authFetch('/api/extension/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setInfo(data))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async () => {
    if (!info?.available) return;
    setDownloading(true);
    try {
      await downloadExtensionZip(`uiauto-recorder-v${info.version}.zip`);
      showToast('插件 ZIP 已开始下载');
    } catch (e) {
      showToast(e.message || '下载失败，请确认后端已启动', 3500);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <WorkbenchLayout className="extension-page">
      <div className="glass-card extension-card">
        <div className="extension-card__header">
          <div>
            <h1 className="extension-card__title">UIAuto 录制插件</h1>
            <p className="extension-card__desc">
              在业务页面采集点击、输入与导航操作，并与平台「用例录制」页实时同步。
            </p>
          </div>
          {info?.available && (
            <button
              type="button"
              className="btn btn-primary extension-download-btn"
              disabled={downloading}
              onClick={handleDownload}
            >
              {downloading ? '打包下载中…' : `下载 v${info.version}`}
            </button>
          )}
        </div>

        {loading ? (
          <p className="extension-muted">加载版本信息…</p>
        ) : !info?.available ? (
          <p className="extension-muted">扩展包暂不可用，请联系管理员。</p>
        ) : (
          <>
            <div className="extension-meta">
              <span>当前版本 <strong>v{info.version}</strong></span>
              {info.changelog && <span className="extension-meta__changelog">{info.changelog}</span>}
            </div>

            <section className="extension-section">
              <h2>安装步骤</h2>
              <ol className="extension-steps">
                {(info.installGuide || []).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="extension-section">
              <h2>使用说明</h2>
              <ul className="extension-bullets">
                <li>安装插件后，打开平台{canWrite ? <Link to="/record">用例录制</Link> : '用例录制（需编辑权限）'}页面，扩展会自动连接当前会话。</li>
                <li>点击 Start 开始录制，在目标网站正常操作即可；步骤会同步到平台中间栏。</li>
                <li>填写用例信息并保存后，可在 <Link to="/cases">用例仓库 → 录制生成用例</Link> 中查看。</li>
                <li>更新插件：下载新版本 ZIP，在扩展管理页移除旧版后重新「加载已解压的扩展程序」。</li>
                <li>调试脚本需额外配置 <Link to="/local-runner">本机运行器</Link>，用于「一键运行」在本机拉起 Chromium。</li>
              </ul>
            </section>

            <div className="extension-footer-actions">
              {canWrite ? (
                <Link to="/record" className="btn btn-primary">前往用例录制</Link>
              ) : (
                <Link to="/cases" className="btn btn-primary">前往用例库</Link>
              )}
              <Link to="/local-runner" className="btn btn-secondary">配置本机运行器</Link>
              <button type="button" className="btn btn-secondary" disabled={downloading} onClick={handleDownload}>
                {downloading ? '下载中…' : '重新下载 ZIP'}
              </button>
            </div>
          </>
        )}
      </div>
    </WorkbenchLayout>
  );
}
