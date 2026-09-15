import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SoftSelect({
  value,
  onChange,
  options = [],
  placeholder = '请选择',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const updateMenuPosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      zIndex: 1200,
    });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => String(o.value) === String(value));
  const display = selected?.label || placeholder;

  const pick = (next) => {
    if (disabled) return;
    onChange?.(next);
    setOpen(false);
  };

  const menu = open && menuStyle ? (
    <ul
      ref={menuRef}
      className="soft-select__menu soft-select__menu--portal"
      role="listbox"
      aria-label={ariaLabel}
      style={menuStyle}
    >
      {options.map((opt) => {
        const active = String(opt.value) === String(value);
        return (
          <li key={String(opt.value)}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              className={`soft-select__option${active ? ' soft-select__option--active' : ''}`}
              onClick={() => pick(opt.value)}
            >
              <span>{opt.label}</span>
              {active && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`soft-select${open ? ' soft-select--open' : ''}${disabled ? ' soft-select--disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="soft-select__trigger plan-detail-field"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={`soft-select__value${selected ? '' : ' soft-select__value--placeholder'}`}>
          {display}
        </span>
        <svg className="soft-select__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}
