import { useCallback, useRef, useState } from 'react';

const MIN_COL = 180;
const MAX_META = 480;
const RESIZER_W = 8;

export default function RecorderWorkspace({ metaPanel, stepsPanel, codePanel }) {
  const [widths, setWidths] = useState({ meta: 300, steps: null });
  const workspaceRef = useRef(null);
  const stepsColRef = useRef(null);
  const dragRef = useRef(null);

  const onResizeStart = useCallback((which) => (e) => {
    e.preventDefault();
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const metaW = widths.meta;
    let stepsW = widths.steps;
    if (which === 'steps' && stepsW == null && stepsColRef.current) {
      stepsW = stepsColRef.current.getBoundingClientRect().width;
    }
    if (stepsW == null) {
      const remain = rect.width - metaW - RESIZER_W * 2;
      stepsW = Math.max(MIN_COL, remain / 2);
    }

    dragRef.current = {
      which,
      startX: e.clientX,
      startMeta: metaW,
      startSteps: stepsW,
      totalW: rect.width,
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const drag = dragRef.current;
      if (!drag) return;
      const d = ev.clientX - drag.startX;
      const chrome = RESIZER_W * 2 + MIN_COL;

      if (drag.which === 'meta') {
        const maxMeta = Math.min(MAX_META, drag.totalW - drag.startSteps - chrome);
        const next = Math.max(MIN_COL, Math.min(maxMeta, drag.startMeta + d));
        setWidths((w) => ({ ...w, meta: next }));
        return;
      }

      const maxSteps = drag.totalW - drag.startMeta - chrome;
      const next = Math.max(MIN_COL, Math.min(maxSteps, drag.startSteps + d));
      setWidths((w) => ({ ...w, steps: next }));
    };

    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [widths.meta, widths.steps]);

  const stepsPinned = widths.steps != null;
  const stepsStyle = stepsPinned
    ? {
      flex: '0 0 auto',
      width: widths.steps,
      minWidth: MIN_COL,
      maxWidth: `calc(100% - ${widths.meta}px - ${MIN_COL}px - ${RESIZER_W * 2}px)`,
    }
    : { flex: '1 1 0', minWidth: MIN_COL };

  return (
    <div className="recorder-workspace" ref={workspaceRef}>
      <div
        className="recorder-workspace__col recorder-workspace__col--meta"
        style={{ flex: '0 0 auto', width: widths.meta, minWidth: MIN_COL, maxWidth: MAX_META }}
      >
        {metaPanel}
      </div>
      <div
        className="recorder-workspace__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整用例信息栏宽度"
        onMouseDown={onResizeStart('meta')}
      />
      <div
        ref={stepsColRef}
        className="recorder-workspace__col recorder-workspace__col--steps"
        style={stepsStyle}
      >
        {stepsPanel}
      </div>
      <div
        className="recorder-workspace__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整录制步骤栏宽度"
        onMouseDown={onResizeStart('steps')}
      />
      <div
        className="recorder-workspace__col recorder-workspace__col--code"
        style={{ flex: '1 1 0', minWidth: MIN_COL }}
      >
        {codePanel}
      </div>
    </div>
  );
}
