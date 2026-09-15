import { useEffect, useRef, useState } from 'react';

export default function CaseVersionHistoryMenu({
  versions,
  currentVersion,
  loading,
  restoringVersion,
  onRestore,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const label = currentVersion ? `版本 v${currentVersion}` : '版本历史';

  return (
    <div className="case-version-menu" ref={rootRef}>
      <button
        type="button"
        className="recorder-btn recorder-btn--ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div className="case-version-menu__panel" role="menu">
          {loading ? (
            <p className="case-version-menu__empty">加载中…</p>
          ) : versions.length === 0 ? (
            <p className="case-version-menu__empty">暂无版本记录</p>
          ) : (
            <ul className="case-version-list case-version-list--menu">
              {versions.map((v) => (
                <li key={v.version} className="case-version-list__item">
                  <div className="case-version-list__meta">
                    <strong>v{v.version}</strong>
                    <span>{v.created_at || ''}</span>
                    {v.change_note && <span className="case-version-list__note">{v.change_note}</span>}
                  </div>
                  {v.version !== currentVersion && (
                    <button
                      type="button"
                      className="recorder-btn recorder-btn--ghost btn-sm"
                      disabled={restoringVersion != null}
                      onClick={() => {
                        onRestore(v.version);
                        setOpen(false);
                      }}
                    >
                      {restoringVersion === v.version ? '回滚中…' : '回滚'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
