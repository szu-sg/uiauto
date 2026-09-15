import { flattenFolderTree } from './CaseFolderTree';

export default function MoveCaseModal({
  open,
  treeData,
  caseCount,
  onClose,
  onConfirm,
  saving,
}) {
  if (!open) return null;

  const options = flattenFolderTree(treeData?.tree ?? []);

  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = fd.get('folder_id');
    const folderId = raw === 'root' ? null : Number(raw);
    onConfirm(folderId);
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--folder-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-case-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal__header">
          <div className="ui-modal__header-text">
            <h2 id="move-case-title" className="ui-modal__title">移动到文件夹</h2>
          </div>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <form className="folder-form" onSubmit={submit}>
          <label className="create-plan-field">
            <span className="create-plan-field__label">目标文件夹</span>
            <select id="move-folder-select" name="folder_id" className="create-plan-name-input import-case-select" defaultValue="root">
              <option value="root">根目录（不归属文件夹）</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {'\u2003'.repeat(opt.depth)}{opt.depth > 0 ? '└ ' : ''}{opt.name}
                </option>
              ))}
            </select>
          </label>

          <footer className="ui-modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '移动中…' : '确定移动'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
