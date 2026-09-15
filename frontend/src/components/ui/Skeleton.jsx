export function SkeletonLine({ width = '100%' }) {
  return <div className="ui-skeleton" style={{ width }} />;
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}><SkeletonLine width={`${50 + (i % 3) * 15}%`} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <td colSpan={cols}><SkeletonLine width={`${60 + (r % 4) * 8}%`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
