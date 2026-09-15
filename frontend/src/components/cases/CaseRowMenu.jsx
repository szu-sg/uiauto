import { useEffect, useRef, useState } from 'react';

export default function CaseRowMenu({ onCopy, onDelete }) {
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

  return (
    <div className="case-row-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm case-row-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        更多
      </button>
      {open && (
        <div className="case-row-menu__panel" role="menu">
          <button
            type="button"
            role="menuitem"
            className="case-row-menu__item"
            onClick={() => {
              setOpen(false);
              onCopy();
            }}
          >
            复制
          </button>
          <button
            type="button"
            role="menuitem"
            className="case-row-menu__item case-row-menu__item--danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
