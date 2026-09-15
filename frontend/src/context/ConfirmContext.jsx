import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: options.title || '确认操作',
        message: options.message || '',
        confirmLabel: options.confirmLabel || '确定',
        cancelLabel: options.cancelLabel || '取消',
        danger: !!options.danger,
      });
    });
  }, []);

  const close = useCallback((result) => {
    setState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state && (
        <div className="ui-modal-backdrop" role="presentation" onClick={() => close(false)}>
          <div
            className="ui-modal ui-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="ui-modal__title">{state.title}</h2>
            {state.message && <p className="ui-modal__body">{state.message}</p>}
            <div className="ui-modal__actions">
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                {state.cancelLabel}
              </button>
              <button
                type="button"
                className={state.danger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => close(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
