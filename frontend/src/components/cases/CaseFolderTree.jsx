import { useEffect, useRef, useState } from 'react';

function IconChevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className={open ? 'case-folder-icon--open' : ''}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFolder({ open }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 5.5V12a1 1 0 001 1h10a1 1 0 001-1V6.5a1 1 0 00-1-1H8L6.5 4H3a1 1 0 00-1 1v.5z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4.5A1 1 0 003 3.5h3.5L8.5 5H13a1 1 0 011 1v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-8z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconAll() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FolderActionsMenu({ onCreateChild, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div className="case-folder-menu" ref={rootRef}>
      <button
        type="button"
        className="case-folder-icon-btn case-folder-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="文件夹操作"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ···
      </button>
      {open && (
        <div className="case-folder-menu__panel" role="menu">
          <button
            type="button"
            role="menuitem"
            className="case-folder-menu__item"
            onClick={() => { setOpen(false); onCreateChild(); }}
          >
            新建子文件夹
          </button>
          <button
            type="button"
            role="menuitem"
            className="case-folder-menu__item"
            onClick={() => { setOpen(false); onRename(); }}
          >
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            className="case-folder-menu__item case-folder-menu__item--danger"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}

function FolderNode({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onCreateChild,
}) {
  const isSelected = selectedId === node.id;
  const hasChildren = node.children?.length > 0;
  const isOpen = expanded.has(node.id);

  return (
    <div className="case-folder-branch">
      <div
        className={`case-folder-item${isSelected ? ' case-folder-item--active' : ''}`}
        style={{ '--folder-depth': depth }}
      >
        <button
          type="button"
          className={`case-folder-item__chevron${hasChildren ? '' : ' case-folder-item__chevron--leaf'}`}
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (isOpen ? '收起' : '展开') : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? <IconChevron open={isOpen} /> : null}
        </button>
        <button
          type="button"
          className="case-folder-item__main"
          onClick={() => onSelect(node.id)}
        >
          <span className="case-folder-item__icon" aria-hidden>
            <IconFolder open={isSelected || isOpen} />
          </span>
          <span className="case-folder-item__name">{node.name}</span>
        </button>
        <div className="case-folder-item__trail">
          <FolderActionsMenu
            onCreateChild={() => onCreateChild(node.id)}
            onRename={() => onRename(node)}
            onDelete={() => onDelete(node)}
          />
          <span className="case-folder-item__count">{node.case_count ?? 0}</span>
        </div>
      </div>
      {hasChildren && isOpen && (
        <div className="case-folder-children">
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CaseFolderTree({
  treeData,
  selectedId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  loading,
  width,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = treeData?.total ?? 0;
  const tree = treeData?.tree ?? [];

  const sidebarStyle = width
    ? { width, flexShrink: 0, minWidth: width, maxWidth: width }
    : undefined;

  return (
    <aside className="case-folder-sidebar" style={sidebarStyle}>
      <div className="case-folder-sidebar__head">
        <h3 className="case-folder-sidebar__title">目录</h3>
        {onCreateFolder && (
          <button
            type="button"
            className="case-folder-icon-btn case-folder-icon-btn--accent"
            onClick={() => onCreateFolder(null)}
            title="新建文件夹"
            aria-label="新建文件夹"
          >
            <IconPlus />
            <span className="case-folder-sidebar__new-label">新建</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="case-folder-sidebar__loading">加载中…</div>
      ) : (
        <nav className="case-folder-nav" aria-label="用例文件夹">
          <button
            type="button"
            className={`case-folder-item case-folder-item--root${selectedId === 'all' ? ' case-folder-item--active' : ''}`}
            onClick={() => onSelect('all')}
          >
            <span className="case-folder-item__chevron case-folder-item__chevron--leaf" aria-hidden />
            <span className="case-folder-item__main case-folder-item__main--static">
              <span className="case-folder-item__icon" aria-hidden><IconAll /></span>
              <span className="case-folder-item__name">全部用例</span>
            </span>
            <div className="case-folder-item__trail">
              <span className="case-folder-item__count">{total}</span>
            </div>
          </button>

          {tree.length === 0 ? (
            <p className="case-folder-sidebar__empty">暂无文件夹，点击「新建」创建</p>
          ) : (
            tree.map((node) => (
              <FolderNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={toggle}
                onSelect={onSelect}
                onRename={onRenameFolder}
                onDelete={onDeleteFolder}
                onCreateChild={onCreateFolder}
              />
            ))
          )}
        </nav>
      )}
    </aside>
  );
}

export function flattenFolderTree(tree, depth = 0, acc = []) {
  for (const node of tree || []) {
    acc.push({ id: node.id, name: node.name, depth });
    if (node.children?.length) flattenFolderTree(node.children, depth + 1, acc);
  }
  return acc;
}
