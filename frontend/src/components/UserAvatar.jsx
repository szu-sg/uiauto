import { displayName, userInitials } from '../utils/userDisplay';

/**
 * @param {{ user?: object|null, name?: string, size?: 'sm'|'md'|'lg', title?: string, className?: string }} props
 */
export default function UserAvatar({ user, name, size = 'md', title, className = '' }) {
  const label = name || displayName(user);
  const initials = user ? userInitials(user) : (label && label !== '—' ? label.slice(0, 1) : '?');
  const avatarUrl = user?.avatar && String(user.avatar).trim();
  const sizeClass = `user-avatar--${size}`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`user-avatar user-avatar--img ${sizeClass} ${className}`.trim()}
        title={title || label}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className={`user-avatar user-avatar--initials ${sizeClass} ${className}`.trim()}
      title={title || label}
      aria-hidden={title ? undefined : true}
    >
      {initials}
    </span>
  );
}
