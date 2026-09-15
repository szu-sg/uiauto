export default function WorkbenchLayout({ children, className = '' }) {
  return (
    <div className={`wb-page${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export function WorkbenchHeader({ title, description, meta, actions, compact = false }) {
  return (
    <header className={`wb-header${compact ? ' wb-header--compact' : ''}`}>
      <div className="wb-header__text">
        <h1 className="wb-header__title">{title}</h1>
        {description && <p className="wb-header__desc">{description}</p>}
        {meta && <div className="wb-header__meta">{meta}</div>}
      </div>
      {actions && <div className="wb-header__actions">{actions}</div>}
    </header>
  );
}

export function WorkbenchStats({ items }) {
  if (!items?.length) return null;
  return (
    <section className="wb-stats wb-stats--cards" aria-label="数据概览">
      {items.map((item) => (
        <div
          key={item.label}
          className={`wb-stat wb-stat--tone-${item.tone || 'blue'}`}
        >
          <span className="wb-stat__label">{item.label}</span>
          <span className={`wb-stat__value${item.small ? ' wb-stat__value--sm' : ''}`}>
            {item.value}
          </span>
        </div>
      ))}
    </section>
  );
}

export function WorkbenchPanel({ toolbar, children, footer, className = '' }) {
  return (
    <section className={`wb-panel${className ? ` ${className}` : ''}`}>
      {toolbar}
      {children}
      {footer}
    </section>
  );
}

export function WorkbenchToolbar({ search, filters, meta, actions }) {
  return (
    <div className="wb-toolbar">
      {search && (
        <div className="wb-toolbar__search">
          <span className="wb-toolbar__search-icon" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          {search}
        </div>
      )}
      <div className="wb-toolbar__filters">
        {filters}
        {meta && <span className="wb-toolbar__meta">{meta}</span>}
        {actions && <div className="wb-toolbar__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function WorkbenchPagination({ pageSize, pageSizeOptions, onPageSizeChange, currentPage, totalPages, onPrev, onNext }) {
  return (
    <div className="wb-pagination">
      <div className="wb-pagination__size">
        <span>每页</span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>条</span>
      </div>
      <div className="wb-pagination__nav">
        <button type="button" className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={onPrev}>
          上一页
        </button>
        <span className="wb-pagination__info">第 {currentPage} / {totalPages} 页</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={currentPage >= totalPages} onClick={onNext}>
          下一页
        </button>
      </div>
    </div>
  );
}

export function WorkbenchSection({ title, hint, children, className = '' }) {
  const isInline = className.includes('wb-section--inline');
  return (
    <section className={`wb-section${className ? ` ${className}` : ''}`}>
      {title && <h3 className="wb-section__title">{title}</h3>}
      {hint && <p className="wb-section__hint">{hint}</p>}
      {isInline ? <div className="wb-section__body">{children}</div> : children}
    </section>
  );
}
