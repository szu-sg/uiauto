import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = '/api';
const RESULTS_BASE = '/results';

export default function RunReport() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [polling, setPolling] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const fetchRun = () => {
      fetch(API + '/runs/' + id)
        .then((r) => r.json())
        .then((data) => {
          setRun(data);
          if (['done', 'failed', 'cancelled'].includes(data.status)) setPolling(false);
        });
    };
    fetchRun();
    if (!polling) return;
    const t = setInterval(fetchRun, 2000);
    return () => clearInterval(t);
  }, [id, polling]);

  const copyReportId = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(id)).then(() => {
      setToast('已复制报告 ID');
      setTimeout(() => setToast(null), 2000);
    }).catch(() => setToast('复制失败'));
  };

  if (!run) return <p className="card-muted">加载中...</p>;

  const isDone = run.status === 'done' || run.status === 'failed' || run.status === 'cancelled';
  const canCancel = run.status === 'pending' || run.status === 'running';
  const cases = run.cases || [];
  const planName = run.plan_name || ('计划 #' + run.plan_id);
  const total = cases.length;
  const passed = cases.filter((c) => c.status === 'passed').length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const totalMs = cases.reduce((s, c) => s + (c.duration_ms || 0), 0);
  const durationStr = totalMs >= 60000 ? `${Math.floor(totalMs / 60000)}分${Math.round((totalMs % 60000) / 1000)}秒` : totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}秒` : totalMs ? `${totalMs}ms` : '—';
  const runDurationStr = run.started_at && run.finished_at
    ? (() => { const d = new Date(run.finished_at) - new Date(run.started_at); return d >= 60000 ? `${Math.floor(d / 60000)}分${Math.round((d % 60000) / 1000)}秒` : `${(d / 1000).toFixed(1)}秒`; })()
    : null;

  const handleCancel = () => {
    if (!window.confirm('确定要停止该任务吗？')) return;
    fetch(API + '/runs/' + id + '/cancel', { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        setPolling(false);
        setRun((prev) => prev ? { ...prev, status: 'cancelled' } : null);
      })
      .catch((e) => alert(e.message));
  };

  return (
    <>
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        <Link to={'/plans/' + run.plan_id}>{planName}</Link>
        <span className="sep">/</span>
        <Link to={'/reports?planId=' + run.plan_id}>执行历史</Link>
        <span className="sep">/</span>
        <span>测试报告 #{run.id}</span>
      </div>
      <div className="page-header page-header--run-report">
        <div className="page-header__title-wrap">
          <h1 className="run-report-title">测试报告</h1>
          <span className="run-report-id" title="点击复制" onClick={copyReportId}>ID：{run.id}</span>
        </div>
        <div className="card-actions">
          <span className={'badge badge-' + (run.status === 'done' ? 'passed' : run.status === 'running' ? 'running' : run.status === 'failed' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : 'pending')}>
            {run.status === 'done' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'failed' ? '执行失败' : run.status === 'cancelled' ? '已取消' : '排队中'}
          </span>
          {canCancel && (
            <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ color: '#f87171' }}>
              停止
            </button>
          )}
          <Link to={'/reports?planId=' + run.plan_id} className="btn btn-secondary">返回执行历史</Link>
          <Link to={'/plans/' + run.plan_id} className="btn btn-secondary">返回计划</Link>
          <Link to="/reports" className="btn btn-secondary">全部执行历史</Link>
        </div>
      </div>
      {toast && <div className="plan-toast" role="status">{toast}</div>}

      <div className="card run-report-stats">
        <div className="run-report-stats__grid">
          <div className="run-report-stats__item">
            <span className="run-report-stats__label">用例通过率</span>
            <span className="run-report-stats__value">{passRate}%</span>
            <span className="card-muted" style={{ fontSize: '0.8125rem' }}>{passed}/{total} 通过</span>
          </div>
          <div className="run-report-stats__item">
            <span className="run-report-stats__label">用例总耗时</span>
            <span className="run-report-stats__value">{durationStr}</span>
          </div>
          {runDurationStr && (
            <div className="run-report-stats__item">
              <span className="run-report-stats__label">执行时间</span>
              <span className="run-report-stats__value">{runDurationStr}</span>
              <span className="card-muted" style={{ fontSize: '0.8125rem' }}>{run.started_at && new Date(run.started_at).toLocaleString('zh-CN')}</span>
            </div>
          )}
        </div>
      </div>

      {run.started_at && (
        <div className="card">
          <p className="card-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
            开始 {new Date(run.started_at).toLocaleString('zh-CN')}
            {run.finished_at && <> · 结束 {new Date(run.finished_at).toLocaleString('zh-CN')}</>}
          </p>
        </div>
      )}

      <div className="card">
        <div className="section-title">用例结果</div>
        <p className="card-muted" style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem' }}>
          执行步骤、截图与录屏请点击各用例的「详情」查看。
        </p>
        <div className="run-report-case-table-wrap">
          <table className="run-report-case-table">
            <thead>
              <tr>
                <th>用例路径</th>
                <th>状态</th>
                <th>耗时</th>
                <th style={{ width: 100, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="run-report-case-path" title={c.case_path}>{c.case_path}</td>
                  <td>
                    <span className={'badge badge-' + (c.status === 'passed' ? 'passed' : c.status === 'failed' ? 'failed' : 'pending')}>
                      {c.status === 'passed' ? '通过' : c.status === 'failed' ? '失败' : c.status}
                    </span>
                  </td>
                  <td>{c.duration_ms != null ? `${c.duration_ms}ms` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/runs/${id}/cases/${c.id}`} className="btn btn-secondary btn-sm">详情</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
