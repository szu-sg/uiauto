import UserAvatar from './UserAvatar';
import { displayName, displaySubtitle } from '../utils/userDisplay';

/**
 * @param {{ user?: object|null, label?: string, showSubtitle?: boolean, size?: 'sm'|'md', className?: string }} props
 */
export default function UserChip({ user, label, showSubtitle = false, size = 'sm', className = '' }) {
  const primary = label || displayName(user);
  const sub = showSubtitle ? displaySubtitle(user) : '';
  const pseudoUser = user || (label ? { real_name: label } : null);

  return (
    <span className={`user-chip user-chip--${size} ${className}`.trim()}>
      <UserAvatar user={pseudoUser} name={primary} size={size} title={sub ? `${primary} · ${sub}` : primary} />
      <span className="user-chip__text">
        <span className="user-chip__name">{primary}</span>
        {showSubtitle && sub && <span className="user-chip__sub">{sub}</span>}
      </span>
    </span>
  );
}
