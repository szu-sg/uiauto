import { useMemo, useRef, useEffect } from 'react';

export default function ScriptEditor({ value, onChange, readOnly = false, className = '' }) {
  const textareaRef = useRef(null);
  const lnRef = useRef(null);

  const lines = useMemo(() => {
    const n = String(value || '').split('\n').length;
    return Math.max(n, 1);
  }, [value]);

  useEffect(() => {
    const ta = textareaRef.current;
    const ln = lnRef.current;
    if (!ta || !ln) return;
    const sync = () => { ln.scrollTop = ta.scrollTop; };
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  return (
    <div className={`recorder-script-editor${className ? ` ${className}` : ''}`}>
      <div className="recorder-script-editor__ln" ref={lnRef} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="recorder-script-editor__input"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="// 可直接编辑 Playwright 脚本（修改后将进入脚本模式）"
      />
    </div>
  );
}
