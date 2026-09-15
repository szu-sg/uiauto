export default function EmptyState({ title, hint, action, variant = 'empty' }) {
  return (
    <div className={`ui-empty ui-empty--${variant}`}>
      <div className="ui-empty__icon" aria-hidden>
        {variant === 'loading' ? (
          <span className="ui-spinner" />
        ) : variant === 'search' ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" /></svg>
        ) : variant === 'error' ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>
        )}
      </div>
      <p className="ui-empty__title">{title}</p>
      {hint && <p className="ui-empty__hint">{hint}</p>}
      {action}
    </div>
  );
}
