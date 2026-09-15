import { useEffect, useState } from 'react';

export default function AddMemberModal({ open, onClose, onSubmit, submitting }) {
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!open) setEmail('');
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ email: email.trim(), role: 'member' });
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="ui-modal ui-modal--add-member"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal__header">
          <h2 id="add-member-title" className="ui-modal__title">添加成员</h2>
          <button type="button" className="ui-modal__close" onClick={handleClose} aria-label="关闭">×</button>
        </header>
        <form onSubmit={submit} className="add-member-modal__form">
          <div className="add-member-modal__row">
            <span className="add-member-modal__label">邮箱</span>
            <input
              type="email"
              className="input add-member-modal__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@wps.cn"
              required
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="ui-modal__actions add-member-modal__actions">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !email.trim()}>
              {submitting ? '添加中…' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
