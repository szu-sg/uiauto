export default function PlanTableActions({
  executing = false,
  enabled = true,
  readOnly = false,
  onView,
  onEdit,
  onExecute,
  onCopy,
  onDelete,
}) {
  if (readOnly) {
    return (
      <div
        className="plan-table-actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="plan-table-actions__btn"
          onClick={onView}
          title="查看计划"
        >
          查看
        </button>
      </div>
    );
  }
  return (
    <div
      className="plan-table-actions"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="plan-table-actions__btn"
        onClick={onEdit}
        title="编辑计划"
      >
        编辑
      </button>
      <button
        type="button"
        className="plan-table-actions__btn plan-table-actions__btn--run"
        onClick={onExecute}
        disabled={executing || !enabled}
        title={enabled ? '执行计划' : '计划已停用'}
      >
        {executing ? '执行中…' : '执行'}
      </button>
      <button
        type="button"
        className="plan-table-actions__btn"
        onClick={onCopy}
        title="复制计划"
      >
        复制
      </button>
      <button
        type="button"
        className="plan-table-actions__btn plan-table-actions__btn--danger"
        onClick={onDelete}
        title="删除计划"
      >
        删除
      </button>
    </div>
  );
}
