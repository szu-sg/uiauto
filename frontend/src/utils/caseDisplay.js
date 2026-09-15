/** 从用例路径或 metadata 解析模块 */
export function caseMetadataEntry(item) {
  const source = item.source || item.case_source || item.metadata?.source || 'recorded';
  return {
    name: item.name || '用例',
    description: item.description,
    priority: item.priority,
    source,
    case_id: item.id,
    ...(item.metadata?.reuse_scope ? { reuse_scope: item.metadata.reuse_scope } : {}),
  };
}

export function getCaseSourceInfo(casePath, caseMetadata = null) {
  const meta = caseMetadata || {};
  const source = meta.source
    || (String(casePath || '').startsWith('imported/') ? 'imported' : 'recorded');
  if (source === 'imported') {
    return { kind: 'imported', label: '导入用例', shortLabel: '导入' };
  }
  if (source === 'recorded') {
    return { kind: 'recorded', label: '录制用例', shortLabel: '录制' };
  }
  return { kind: 'platform', label: '团队用例', shortLabel: '用例' };
}

export function getCaseModule(itemOrPath) {
  if (itemOrPath && typeof itemOrPath === 'object') {
    const fromMeta = itemOrPath.metadata?.module;
    if (fromMeta) return fromMeta;
    return getCaseModule(itemOrPath.path);
  }
  const path = itemOrPath;
  if (!path) return '—';
  const parts = String(path).split('/').filter(Boolean);
  if (parts.length < 2) return '—';
  return parts[parts.length - 2];
}

export function getCaseTags(item) {
  if (Array.isArray(item?.tags) && item.tags.length) return item.tags;
  const meta = item?.metadata;
  if (meta && Array.isArray(meta.tags) && meta.tags.length) return meta.tags;
  return [];
}

export function getCaseRemark(item) {
  const text = item?.description?.trim();
  return text || '—';
}

export function priorityClass(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === 'p0' || p === 'high') return 'case-priority case-priority--p0';
  if (p === 'p1' || p === 'medium') return 'case-priority case-priority--p1';
  if (p === 'p2' || p === 'low') return 'case-priority case-priority--p2';
  return 'case-priority case-priority--default';
}

export function formatPriorityLabel(priority) {
  const p = String(priority || '').trim();
  return p || '—';
}

export function caseSearchHaystack(item) {
  const tags = getCaseTags(item).join(' ');
  return [
    item.name,
    item.path,
    item.description,
    item.priority,
    getCaseModule(item),
    tags,
    item.case_source,
    item.metadata?.module,
  ].filter(Boolean).join(' ').toLowerCase();
}
