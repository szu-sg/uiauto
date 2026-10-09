/**
 * 通过率环形图（纯 SVG，无第三方依赖）
 * @param {number} rate 0-100 的通过率
 * @param {number} size 直径 px
 * @param {number} stroke 环宽 px
 */
export default function PassRateRing({
  rate,
  size = 88,
  stroke = 9,
  showValue = true,
  centerText,
  ariaLabel,
  /** pass：按通过率着色；progress：执行中进度（中性主色） */
  mode = 'pass',
}) {
  const safe = Number.isFinite(rate) ? Math.max(0, Math.min(100, Math.round(rate))) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (safe / 100) * c;
  const tone = mode === 'progress'
    ? 'var(--c-primary)'
    : safe >= 80 ? 'var(--c-success)' : safe >= 50 ? 'var(--c-warning)' : 'var(--c-danger)';
  const label = ariaLabel ?? `通过率 ${safe}%`;
  return (
    <div className="dash-ring" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      {showValue && (
        <span className="dash-ring__value" style={{ color: tone }}>
          {centerText ?? `${safe}%`}
        </span>
      )}
    </div>
  );
}
