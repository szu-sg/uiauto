import { useLocalRunner } from '../../context/LocalRunnerContext';

export default function LocalRunnerBanner({ compact = false }) {
  const { ready, checking, openSetup } = useLocalRunner();

  if (checking || ready) return null;

  return (
    <div className={`local-runner-banner${compact ? ' local-runner-banner--compact' : ''}`}>
      <div className="local-runner-banner__text">
        <strong>本机运行器未连接</strong>
        <span>「一键运行」在本机执行，请先下载并启动运行器。</span>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => openSetup('banner')}>
        配置本机运行器
      </button>
    </div>
  );
}
