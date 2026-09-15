import { useEffect, useRef, useState } from 'react';

export default function FolderFormModal({
  open,
  mode = 'create',
  initialName = '',
  parentHint,
  onClose,
  onSubmit,
  saving,
}) {
  const inputRef = useRef(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setName(initialName || '');
    setError('');
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, initialName, onClose]);

  if (!open) return null;

  const title = mode === 'rename' ? '重命名文件夹' : parentHint ? '新建子文件夹' : '新建文件夹';

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    if (trimmed.length > 64) {
      setError('名称不能超过 64 个字符');
      return;
    }
    if (!/[\w\u4e00-\u9fa5]/.test(trimmed)) {
      setError('请使用中文、字母或数字');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--folder-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal__header">
          <div className="ui-modal__header-text">
            <h2 id="folder-form-title" className="ui-modal__title">{title}</h2>
          </div>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <form className="folder-form" onSubmit={submit}>
          <label className="create-plan-field">
            <span className="create-plan-field__label">
              文件夹名称 <span className="create-plan-required">*</span>
            </span>
            <input
              ref={inputRef}
              id="folder-form-name"
              className="create-plan-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="例如：登录模块"
              maxLength={64}
              autoComplete="off"
            />
          </label>
          {error && <p className="create-plan-error" role="alert">{error}</p>}

          <footer className="ui-modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中…' : '确定'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
