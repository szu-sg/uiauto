import { useEffect, useRef, useState } from 'react';
import { ASSIGNABLE_ROLES, teamRoleLabel } from '../../utils/teamDisplay';

export default function MemberRolePicker({
  role,
  editable,
  disabled,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!editable) {
    return (
      <span className={`space-role-pill space-role-pill--${role}`}>
        {teamRoleLabel(role)}
      </span>
    );
  }

  const pick = (next) => {
    setOpen(false);
    if (next !== role) onChange(next);
  };

  return (
    <div className="space-role-picker" ref={ref}>
      <button
        type="button"
        className={`space-role-pill space-role-pill--${role} space-role-pill--editable`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {teamRoleLabel(role)}
        <span className="space-role-pill__chev" aria-hidden />
      </button>
      {open && (
        <ul className="space-role-picker__menu" role="listbox">
          {ASSIGNABLE_ROLES.map((r) => (
            <li key={r}>
              <button
                type="button"
                role="option"
                aria-selected={r === role}
                className={`space-role-picker__option${r === role ? ' space-role-picker__option--active' : ''}`}
                onClick={() => pick(r)}
              >
                {teamRoleLabel(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
