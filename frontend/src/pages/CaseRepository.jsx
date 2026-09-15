import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import BindPlanModal from '../components/cases/BindPlanModal';
import FolderFormModal from '../components/cases/FolderFormModal';
import ImportCaseModal from '../components/cases/ImportCaseModal';
import CaseFolderTree from '../components/cases/CaseFolderTree';
import MoveCaseModal from '../components/cases/MoveCaseModal';
import UserChip from '../components/UserChip';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import { useUser } from '../context/UserContext';
import {
  caseSearchHaystack,
  formatPriorityLabel,
  getCaseRemark,
  getCaseTags,
  priorityClass,
} from '../utils/caseDisplay';
import { displayName, isSameCreator } from '../utils/userDisplay';
import { formatDateTime } from '../utils/formatTime';
import { canWriteTeamResources } from '../utils/teamDisplay';

const API = '/api';
const PAGE_SIZE = 10;
const SIDEBAR_WIDTH_KEY = 'uiauto.caseRepo.sidebarWidth';
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 280;

function readSidebarWidth() {
  try {
    const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n;
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT;
}

function CaseTagList({ tags }) {
  if (!tags.length) return <span className="case-repo-cell-muted">—</span>;
  return (
    <div className="case-repo-tags">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag} className="case-repo-tag">{tag}</span>
      ))}
      {tags.length > 4 && <span className="case-repo-tag case-repo-tag--more">+{tags.length - 4}</span>}
    </div>
  );
}

function CaseCreatorCell({ createdBy, currentUser }) {
  if (!createdBy) return <span className="case-repo-cell-muted">—</span>;
  const chipUser = isSameCreator(displayName(createdBy), currentUser) && currentUser
    ? currentUser
    : createdBy;
  return <UserChip user={chipUser} size="sm" />;
}

function buildFolderNameMap(tree = []) {
  const map = new Map();
  const walk = (nodes) => {
    for (const node of nodes) {
      map.set(node.id, node.name);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return map;
}

export default function CaseRepository() {
  const user = useUser();
  const canWrite = canWriteTeamResources(user);
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const pageCheckRef = useRef(null);
  const sidebarDragRef = useRef(null);

  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [folderTree, setFolderTree] = useState({ total: 0, uncategorized: 0, tree: [] });
  const [folderLoading, setFolderLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [bindPlanOpen, setBindPlanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);
  const [folderForm, setFolderForm] = useState(null);
  const [folderFormSaving, setFolderFormSaving] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  const folderNameMap = useMemo(
    () => buildFolderNameMap(folderTree.tree),
    [folderTree.tree],
  );

  const importFolderId = useMemo(() => {
    if (selectedFolderId === 'all') return null;
    const n = Number(selectedFolderId);
    return Number.isFinite(n) ? n : null;
  }, [selectedFolderId]);

  const importFolderLabel = useMemo(() => {
    if (!importFolderId) return null;
    return folderNameMap.get(importFolderId) || null;
  }, [importFolderId, folderNameMap]);

  const recordLink = importFolderId ? `/record?folder_id=${importFolderId}` : '/record';

  const onSidebarResizeStart = useCallback((e) => {
    e.preventDefault();
    sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const drag = sidebarDragRef.current;
      if (!drag) return;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, drag.startWidth + ev.clientX - drag.startX),
      );
      setSidebarWidth(next);
    };

    const onUp = () => {
      sidebarDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSidebarWidth((w) => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const refreshFolders = useCallback(() => {
    setFolderLoading(true);
    authFetch(`${API}/cases/folders/tree`)
      .then((r) => (r.ok ? r.json() : { total: 0, uncategorized: 0, tree: [] }))
      .then((data) => setFolderTree(data))
      .catch(() => setFolderTree({ total: 0, uncategorized: 0, tree: [] }))
      .finally(() => setFolderLoading(false));
  }, []);

  const refreshCatalog = useCallback(() => {
    setCatalogLoading(true);
    const qs = new URLSearchParams();
    if (!keyword.trim() && selectedFolderId !== 'all') {
      qs.set('folder_id', selectedFolderId);
    }
    const url = `${API}/cases${qs.toString() ? `?${qs}` : ''}`;
    authFetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [keyword, selectedFolderId]);

  const refreshAll = useCallback(() => {
    refreshFolders();
    refreshCatalog();
  }, [refreshFolders, refreshCatalog]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  const filteredCatalog = useMemo(() => {
    if (!keyword.trim()) return catalog;
    const k = keyword.trim().toLowerCase();
    return catalog.filter((item) => caseSearchHaystack(item).includes(k));
  }, [catalog, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
  const pageIndex = Math.min(Math.max(1, page), totalPages);
  const paginatedCatalog = filteredCatalog.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE);
  const pageIds = paginatedCatalog.map((item) => item.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const pageSomeSelected = pageIds.some((id) => selected.has(id)) && !pageAllSelected;

  useEffect(() => {
    if (pageCheckRef.current) pageCheckRef.current.indeterminate = pageSomeSelected;
  }, [pageSomeSelected, pageIndex]);

  useEffect(() => {
    setPage(1);
  }, [keyword, selectedFolderId]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleBulkSelectMode = () => {
    if (bulkSelectMode) {
      setBulkSelectMode(false);
      setSelected(new Set());
    } else {
      setBulkSelectMode(true);
    }
  };

  const selectedItems = catalog.filter((item) => selected.has(item.id));

  const resolveTargetFolderForCopy = (item) => {
    if (item?.folder_id) return item.folder_id;
    if (selectedFolderId !== 'all') {
      return selectedFolderId;
    }
    return null;
  };

  const handleCreateFolder = (parentId) => {
    const parentHint = parentId
      ? `将在「${folderNameMap.get(parentId) || '文件夹'}」下创建子文件夹`
      : null;
    setFolderForm({ mode: 'create', parentId, parentHint });
  };

  const handleRenameFolder = (folder) => {
    setFolderForm({ mode: 'rename', folder, initialName: folder.name });
  };

  const submitFolderForm = async (name) => {
    setFolderFormSaving(true);
    try {
      if (folderForm?.mode === 'rename') {
        const r = await authFetch(`${API}/cases/folders/${folderForm.folder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '重命名失败');
        showToast('已重命名');
      } else {
        const r = await authFetch(`${API}/cases/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parent_id: folderForm?.parentId ?? null }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '创建失败');
        showToast('文件夹已创建');
      }
      setFolderForm(null);
      refreshFolders();
    } catch (e) {
      showToast(e.message || '操作失败');
    } finally {
      setFolderFormSaving(false);
    }
  };

  const handleDeleteFolder = async (folder) => {
    const ok = await confirm({
      title: '删除文件夹',
      message: `确定删除「${folder.name}」？子文件夹会一并删除，用例将移至上级目录。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await authFetch(`${API}/cases/folders/${folder.id}?move_cases_to=parent`, {
        method: 'DELETE',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '删除失败');
      if (selectedFolderId === folder.id) setSelectedFolderId('all');
      refreshAll();
      showToast('文件夹已删除');
    } catch (e) {
      showToast(e.message || '删除失败');
    }
  };

  const copyOne = async (item) => {
    try {
      const r = await authFetch(`${API}/cases/${item.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: resolveTargetFolderForCopy(item) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '复制失败');
      refreshAll();
      showToast(`已复制为「${data.name || '副本'}」`);
    } catch (e) {
      showToast(e.message || '复制失败');
    }
  };

  const batchCopy = async () => {
    if (selected.size === 0) return;
    try {
      const items = selectedItems;
      for (const item of items) {
        const r = await authFetch(`${API}/cases/${item.id}/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_id: resolveTargetFolderForCopy(item) }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || '复制失败');
        }
      }
      refreshAll();
      showToast(`已复制 ${items.length} 条用例`);
    } catch (e) {
      showToast(e.message || '批量复制失败');
    }
  };

  const confirmMove = async (folderId) => {
    setMoveSaving(true);
    try {
      const r = await authFetch(`${API}/cases/folders/move-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_ids: [...selected], folder_id: folderId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '移动失败');
      setMoveOpen(false);
      setSelected(new Set());
      refreshAll();
      showToast(`已移动 ${data.moved ?? selected.size} 条用例`);
    } catch (e) {
      showToast(e.message || '移动失败');
    } finally {
      setMoveSaving(false);
    }
  };

  const batchDelete = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: '批量删除用例',
      message: `确定从仓库移除已选的 ${selected.size} 条用例？`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const results = await Promise.all(
        [...selected].map(async (id) => {
          const r = await authFetch(`${API}/cases/${id}`, { method: 'DELETE' });
          const data = await r.json().catch(() => ({}));
          return { id, ok: r.ok, error: data.error };
        }),
      );
      const failed = results.filter((x) => !x.ok);
      setSelected(new Set());
      refreshAll();
      if (failed.length) {
        showToast(`已删除 ${results.length - failed.length} 条，${failed.length} 条失败`, 3600);
      } else {
        showToast('已删除选中用例');
      }
    } catch {
      showToast('删除失败');
    }
  };

  const deleteOne = async (item) => {
    const ok = await confirm({
      title: '删除用例',
      message: `确定删除「${item.name || item.path}」？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await authFetch(`${API}/cases/${item.id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '删除失败');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      refreshAll();
      showToast('已删除用例');
    } catch {
      showToast('删除失败');
    }
  };

  const renderEmpty = () => (
    <div className="case-repo-empty case-repo-empty--compact">
      <p className="case-repo-empty__title">暂无用例</p>
      <div className="case-repo-empty__actions">
        {canWrite && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setImportOpen(true)}>
              导入用例
            </button>
            <Link to={recordLink} className="btn btn-secondary btn-sm">前往录制</Link>
          </>
        )}
      </div>
    </div>
  );

  return (
    <WorkbenchLayout className="case-repo-page wb-page--fill">
      <div className="glass-card case-repo-panel case-repo-panel--with-folders">
        <div className="case-repo-layout">
          <CaseFolderTree
            treeData={folderTree}
            selectedId={selectedFolderId}
            loading={folderLoading}
            width={sidebarWidth}
            onSelect={setSelectedFolderId}
            onCreateFolder={canWrite ? handleCreateFolder : undefined}
            onRenameFolder={canWrite ? handleRenameFolder : undefined}
            onDeleteFolder={canWrite ? handleDeleteFolder : undefined}
          />

          <div
            className="case-repo-layout__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整目录栏宽度"
            onMouseDown={onSidebarResizeStart}
          />

          <div className="case-repo-main">
            <div className="case-repo-list-card">
              <div className="case-repo-list-card__header">
                <div className="case-repo-list-card__top">
                  <div className="case-repo-list-card__title-block">
                    {canWrite && (
                      <button
                        type="button"
                        className={`btn btn-secondary btn-sm case-repo-bulk-toggle${bulkSelectMode ? ' case-repo-bulk-toggle--active' : ''}`}
                        onClick={toggleBulkSelectMode}
                      >
                        {bulkSelectMode ? '取消批量' : '批量选择'}
                      </button>
                    )}
                    <h2 className="case-repo-list-card__title">用例库</h2>
                    <span className="case-repo-list-card__count">
                      共 <strong>{filteredCatalog.length}</strong> 条
                    </span>
                  </div>
                  <div className="case-repo-search">
                    <span className="case-repo-search__icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      className="plan-detail-field case-repo-search__input"
                      placeholder="搜索名称 / 标签 / 备注"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </div>
                  {canWrite && (
                    <div className="case-repo-list-card__actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setImportOpen(true)}
                      >
                        导入用例
                      </button>
                      <Link to={recordLink} className="btn btn-secondary btn-sm">前往录制</Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="case-repo-list-card__body">
                {catalogLoading ? (
                  <div className="case-repo-loading">加载中…</div>
                ) : catalog.length === 0 ? (
                  renderEmpty()
                ) : filteredCatalog.length === 0 ? (
                  <div className="case-repo-empty case-repo-empty--compact">
                    <p className="case-repo-empty__title">未找到匹配的用例</p>
                  </div>
                ) : (
                  <>
                    <div className={`ui-table-wrap case-repo-table-wrap case-repo-table-scroll${bulkSelectMode ? ' case-repo-table-wrap--bulk' : ''}`}>
                      <table className="ui-table case-repo-table">
                        <thead>
                          <tr>
                            <th className="case-repo-table__check">
                              <input
                                ref={pageCheckRef}
                                type="checkbox"
                                checked={pageAllSelected}
                                onChange={() => {
                                  const next = new Set(selected);
                                  if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
                                  else pageIds.forEach((id) => next.add(id));
                                  setSelected(next);
                                }}
                                aria-label="全选当前页"
                              />
                            </th>
                            <th className="case-repo-table__name-h">名称</th>
                            <th>优先级</th>
                            <th>标签</th>
                            <th>备注</th>
                            <th>创建人</th>
                            <th>创建时间</th>
                            <th className="case-repo-table__actions">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedCatalog.map((item) => {
                            const isSelected = selected.has(item.id);
                            const tags = getCaseTags(item);
                            return (
                              <tr
                                key={item.id}
                                className={isSelected ? 'case-repo-row--selected' : ''}
                                onClick={bulkSelectMode ? () => toggle(item.id) : undefined}
                              >
                                <td className="case-repo-table__check" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" checked={isSelected} onChange={() => toggle(item.id)} />
                                </td>
                                <td className="case-repo-table__name">{item.name || '用例'}</td>
                                <td>
                                  <span className={priorityClass(item.priority)}>
                                    {formatPriorityLabel(item.priority)}
                                  </span>
                                </td>
                                <td><CaseTagList tags={tags} /></td>
                                <td
                                  className="case-repo-table__remark"
                                  title={item.description?.trim() || ''}
                                >
                                  {getCaseRemark(item)}
                                </td>
                                <td className="case-repo-table__creator">
                                  <CaseCreatorCell createdBy={item.created_by} currentUser={user} />
                                </td>
                                <td className="case-repo-table__time" title={item.created_at || ''}>
                                  {formatDateTime(item.created_at)}
                                </td>
                                <td className="case-repo-table__actions" onClick={(e) => e.stopPropagation()}>
                                  <Link to={`/cases/${item.id}/edit`} className="btn btn-secondary btn-sm">
                                    {canWrite ? '编辑' : '查看'}
                                  </Link>
                                  {canWrite && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => copyOne(item)}
                                      >
                                        复制
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm case-repo-footer__delete"
                                        onClick={() => deleteOne(item)}
                                      >
                                        删除
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {filteredCatalog.length > 0 && (
                      <div className="case-repo-pagination">
                        <span className="case-repo-pagination__info">
                          第 {pageIndex} / {totalPages} 页，本页 {paginatedCatalog.length} 条
                        </span>
                        <div className="case-repo-pagination__nav">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={pageIndex <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            上一页
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={pageIndex >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            下一页
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {canWrite && bulkSelectMode && (
              <div className="case-repo-footer">
                <span className="case-repo-footer__stat">已选中 <strong>{selected.size}</strong> 条用例</span>
                <div className="case-repo-footer__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={selected.size === 0}
                    onClick={() => setMoveOpen(true)}
                  >
                    移动到文件夹
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={selected.size === 0}
                    onClick={batchCopy}
                  >
                    批量复制
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={selected.size === 0}
                    onClick={() => setBindPlanOpen(true)}
                  >
                    绑定至计划
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm case-repo-footer__delete"
                    disabled={selected.size === 0}
                    onClick={batchDelete}
                  >
                    批量删除
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {bindPlanOpen && (
        <BindPlanModal
          caseItems={selectedItems}
          onClose={() => setBindPlanOpen(false)}
        />
      )}

      <MoveCaseModal
        open={moveOpen}
        treeData={folderTree}
        caseCount={selected.size}
        onClose={() => setMoveOpen(false)}
        onConfirm={confirmMove}
        saving={moveSaving}
      />

      <ImportCaseModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        folderId={importFolderId}
        folderLabel={importFolderLabel}
        showToast={showToast}
        onImported={() => {
          refreshAll();
        }}
      />

      <FolderFormModal
        open={!!folderForm}
        mode={folderForm?.mode}
        initialName={folderForm?.initialName || folderForm?.folder?.name || ''}
        parentHint={folderForm?.parentHint}
        onClose={() => setFolderForm(null)}
        onSubmit={submitFolderForm}
        saving={folderFormSaving}
      />
    </WorkbenchLayout>
  );
}
