import { useEffect, useState } from 'react';

const EMPTY = JSON.stringify({ cookies: [], origins: [] }, null, 2);

export default function AuthJsonEditModal({ open, storageState, onClose, onSave, onClear, onError }) {
  const [text, setText] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    const base = storageState && typeof storageState === 'object'
      ? storageState
      : { cookies: [], origins: [] };
    setText(JSON.stringify(base, null, 2));
  }, [open, storageState]);

  if (!open) return null;

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        onError?.('根节点须为对象，含 cookies 数组');
        return;
      }
      if (!Array.isArray(parsed.cookies)) {
        onError?.('cookies 须为数组');
        return;
      }
      onSave({
        cookies: parsed.cookies,
        origins: Array.isArray(parsed.origins) ? parsed.origins : [],
      });
    } catch (e) {
      onError?.(e.message || 'JSON 无效');
    }
  };

  return (
    <div className="recorder-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="recorder-modal recorder-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-json-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="auth-json-title" className="recorder-modal__title">编辑登录 Cookie</h3>
        <p className="recorder-modal__hint">
          Playwright <code>storageState</code> 格式；保存时仅保留 <code>wps_sid</code> / <code>wps_sids</code>。
          清空或过期后，计划执行将使用测试计划绑定的执行环境账号登录。
        </p>
        <textarea
          className="recorder-json-editor"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="recorder-modal__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          {onClear && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onClear()}>
              清空 Cookie
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>应用</button>
        </div>
      </div>
    </div>
  );
}
