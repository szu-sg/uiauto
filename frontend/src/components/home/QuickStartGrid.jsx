import { Link } from 'react-router-dom';

const ITEMS = [
  {
    id: 'new-plan',
    title: '新建计划',
    description: '从用例库选择用例，创建并调度自动化测试计划',
    action: 'create-plan',
    tone: 'primary',
    linkText: '立即开始',
    icon: 'plan',
  },
  {
    id: 'case-repo',
    title: '用例仓库',
    description: '浏览录制与导入的 Playwright 用例，绑定测试计划',
    to: '/cases',
    tone: 'sky',
    linkText: '进入仓库',
    icon: 'repo',
  },
  {
    id: 'case-record',
    title: '用例录制',
    description: '可视化录制浏览器操作，一键生成自动化脚本',
    to: '/record',
    tone: 'mint',
    linkText: '进入录制',
    icon: 'record',
  },
  {
    id: 'fastbot',
    title: 'FastBot',
    description: '智能随机探索与异常路径发现，辅助回归测试',
    tone: 'violet',
    badge: '敬请期待',
    icon: 'fastbot',
  },
  {
    id: 'more',
    title: '更多',
    description: '定时流水线、批量执行、环境分组等扩展能力',
    tone: 'muted',
    badge: '敬请期待',
    icon: 'more',
  },
];

function QuickIcon({ name }) {
  switch (name) {
    case 'plan':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'repo':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2.5c-5.2 0-9.5 4.1-9.5 9.2 0 4 2.6 7.4 6.2 8.6.5.1.7-.2.7-.5v-1.8c-2.5.5-3.1-1.2-3.1-1.2-.4-1-.9-1.3-1.5-1-.8.2-.8 1.2-.8 1.2-.7 1.4 1.8 1 2.2.8.1-.7.3-1.2.6-1.5-2-.2-4.1-.9-4.1-4.5 0-1 .4-1.8 1-2.4-.1-.3-.5-1.2.1-2.5 0 0 .8-.3 2.7 1 .8-.2 1.7-.3 2.6-.3s1.8.1 2.6.3c1.9-1.3 2.7-1 2.7-1 .6 1.3.2 2.2.1 2.5.6.6 1 1.4 1 2.4 0 3.6-2.1 4.3-4.1 4.5.3.3.6.8.6 1.6v2.4c0 .3.2.6.7.5 3.6-1.2 6.2-4.6 6.2-8.6 0-5.1-4.3-9.2-9.5-9.2z"
            fill="currentColor"
          />
        </svg>
      );
    case 'record':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </svg>
      );
    case 'fastbot':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="9" cy="13" r="1.2" fill="currentColor" />
          <circle cx="15" cy="13" r="1.2" fill="currentColor" />
          <path d="M9 5.5V8M15 5.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function QuickStartCard({ item, onNewPlan }) {
  const className = [
    'glass-card',
    'dash-quick-card',
    `dash-quick-card--${item.tone}`,
    item.to || item.action === 'create-plan' ? 'glass-hover' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <div className={`dash-quick-card__icon dash-quick-card__icon--${item.tone}`} aria-hidden>
        <QuickIcon name={item.icon} />
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      {item.to ? (
        <span className={`dash-quick-card__link dash-quick-card__link--${item.tone}`}>
          {item.linkText} →
        </span>
      ) : (
        <span className="dash-quick-card__badge">{item.badge}</span>
      )}
    </>
  );

  if (item.action === 'create-plan') {
    return (
      <button type="button" className={className} onClick={onNewPlan}>
        {body}
      </button>
    );
  }

  if (item.to) {
    return (
      <Link to={item.to} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

export default function QuickStartGrid({ onNewPlan }) {
  return (
    <section className="dash-quick-section" aria-label="快速开始">
      <h2 className="dash-section-title">快速开始</h2>
      <div className="dash-quick">
        {ITEMS.map((item) => (
          <QuickStartCard key={item.id} item={item} onNewPlan={onNewPlan} />
        ))}
      </div>
    </section>
  );
}
