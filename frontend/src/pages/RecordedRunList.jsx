import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import StatusBadge from '../components/ui/StatusBadge';
import LocalRunnerBanner from '../components/recorder/LocalRunnerBanner';
import { useLocalRunner } from '../context/LocalRunnerContext';
import { listLocalRuns } from '../utils/localRunnerApi';

export default function RecordedRunList() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const { ready: runnerReady, openSetup } = useLocalRunner();

  const refresh = async () => {
    setLoading(true);
    try {
      if (!runnerReady) {
        setRuns([]);
        return;
      }
      const data = await listLocalRuns(100);
      setRuns(Array.isArray(data.items) ? data.items : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [runnerReady]);

  return (
    <WorkbenchLayout className="case-repo-page wb-page--fill">
      <LocalRunnerBanner />
      <div className="glass-card case-repo-panel">
        <div className="case-repo-list-card">
          <div className="case-repo-list-card__header">
            <div className="case-repo-list-card__top">
              <div className="case-repo-list-card__title-block">
                <h2 className="case-repo-list-card__title">本机调试记录</h2>
                <span className="case-repo-list-card__count">共 <strong>{runs.length}</strong> 条</span>
              </div>
              <div className="case-repo-list-card__actions">
                <Link to="/cases?tab=recorded" className="btn btn-secondary btn-sm">返回用例库</Link>
                <Link to="/record" className="btn btn-primary btn-sm">用例录制</Link>
                {!runnerReady && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openSetup('manual')}
                  >
                    配置本机环境
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="case-repo-list-card__body">
            {loading && !runs.length ? (
              <div className="case-repo-loading">加载中…</div>
            ) : runnerReady === false ? (
              <div className="case-repo-empty case-repo-empty--compact">
                <p className="case-repo-empty__title">本机运行器未启动</p>
                <p className="case-repo-empty__hint">
                  请先在 <Link to="/local-runner">本机运行器配置页</Link> 完成安装并启动运行器。
                </p>
              </div>
            ) : runs.length === 0 ? (
              <div className="case-repo-empty case-repo-empty--compact">
                <p className="case-repo-empty__title">暂无调试记录</p>
                <p className="case-repo-empty__hint">在录制页或用例编辑页点击「一键运行」即可在本机执行</p>
              </div>
            ) : (
              <div className="recorded-run-list">
                {runs.map((run) => (
                  <article key={run.id} className="recorded-run-item">
                    <button
                      type="button"
                      className="recorded-run-item__head"
                      onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                    >
                      <div className="recorded-run-item__meta">
                        <StatusBadge status={run.status} />
                        <strong>{run.case_name || `调试 #${run.id.slice(0, 8)}`}</strong>
                        <span className="recorded-run-item__time">{run.finished_at || run.started_at || ''}</span>
                      </div>
                      <span className="recorded-run-item__id">#{run.id.slice(0, 8)}</span>
                    </button>
                    {expanded === run.id && (
                      <div className="recorded-run-item__body">
                        {run.error_message && (
                          <p className="recorded-run-item__error">{run.error_message}</p>
                        )}
                        {run.video_url && (
                          <div className="recorded-run-item__video">
                            <span className="recorded-run-item__video-label">录屏</span>
                            <video src={run.video_url} controls preload="metadata" playsInline />
                          </div>
                        )}
                        {run.screenshot_url && (
                          <a href={run.screenshot_url} target="_blank" rel="noreferrer">
                            查看截图
                          </a>
                        )}
                        {run.log_text && (
                          <pre className="recorded-run-item__log">{run.log_text}</pre>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkbenchLayout>
  );
}
