import { Link } from 'react-router-dom';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import LocalRunnerBanner from '../components/recorder/LocalRunnerBanner';
import { useLocalRunner } from '../context/LocalRunnerContext';
import { detectPlatform, localRunnerStartHint } from '../utils/detectPlatform';

export default function LocalRunnerSetup() {
  const { ready, openSetup } = useLocalRunner();
  const hint = localRunnerStartHint(detectPlatform());

  return (
    <WorkbenchLayout className="extension-page">
      <div className="glass-card extension-card">
        <div className="extension-card__header">
          <div>
            <h1 className="extension-card__title">本机运行器</h1>
          </div>
          {!ready && (
            <button type="button" className="btn btn-primary" onClick={() => openSetup('manual')}>
              开始配置
            </button>
          )}
        </div>

        <LocalRunnerBanner />

        <section className="extension-section lr-setup-overview">
          <h2>两步完成（仅需一次）</h2>
          <ol className="extension-steps">
            <li>安装 <a href="https://nodejs.org/" target="_blank" rel="noreferrer">Node.js 18+</a>（若尚未安装）</li>
            <li>下载运行器 ZIP 并解压</li>
            <li>
              {hint.title}：双击 <code>start.bat</code>（后台运行，无黑窗口）
            </li>
          </ol>
          <p className="extension-muted">
            每次开机后点一次 <code>start.bat</code> 即可；若希望登录后自动启动，运行 <code>setup-autostart.bat</code>。
            停止运行器用 <code>stop.bat</code>；查看日志见 <code>runner.log</code>。
          </p>
        </section>

        <div className="extension-footer-actions">
          {!ready && (
            <button type="button" className="btn btn-primary" onClick={() => openSetup('manual')}>
              下载并配置
            </button>
          )}
          <Link to="/record" className="btn btn-secondary">前往用例录制</Link>
          <Link to="/cases" className="btn btn-secondary">用例仓库</Link>
        </div>
      </div>
    </WorkbenchLayout>
  );
}
