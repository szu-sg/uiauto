const ICONS = {
  chromium: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="#5B8DEF" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="4.5" fill="#5B8DEF" />
      <path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke="#5B8DEF" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.8 6.8l4.2 4.2M21 21l4.2 4.2M25.2 6.8L21 11M11 21l-4.2 4.2" stroke="#93B8F5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  chrome: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="#fff" stroke="#E2E8F0" strokeWidth="1" />
      <path d="M16 3a13 13 0 0 1 11.26 6.5H16V3z" fill="#EA4335" />
      <path d="M16 29a13 13 0 0 1-11.26-6.5h22.52A13 13 0 0 1 16 29z" fill="#34A853" />
      <path d="M4.74 9.5A13 13 0 0 0 4.74 22.5L16 9.5H4.74z" fill="#FBBC05" />
      <path d="M16 9.5h11.26A13 13 0 0 0 16 3v6.5z" fill="#EA4335" opacity="0.9" />
      <circle cx="16" cy="16" r="5.5" fill="#4285F4" stroke="#fff" strokeWidth="2" />
    </svg>
  ),
  edge: (gradId) => (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" fill={`url(#${gradId})`} />
      <path d="M20.5 10.5c-3.2-2.2-7.8-1.2-9.8 2.2-1.4 2.4-.8 5.4 1.4 7.1 2.8 2.2 6.8 1.4 8.6-1.6-2.4 1.2-5.4.4-6.8-1.8-1.6-2.6-.2-6 2.8-7.2 2-.8 4.2-.4 5.8 1.3z" fill="#fff" />
      <defs>
        <linearGradient id={gradId} x1="4" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EBEFF" />
          <stop offset="1" stopColor="#0078D4" />
        </linearGradient>
      </defs>
    </svg>
  ),
  firefox: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="#FF7139" />
      <path d="M10 11.5c1.2-2.8 4-4.8 7.2-4.5 3.8.4 6.6 3.4 6.8 7.2.2 3.2-1.4 6-4 7.4-2.2 1.1-4.8 1-7-.4-2.8-1.8-4.2-5.2-3.4-8.4.4-1.6 1.2-2.8 2.4-3.7z" fill="#FFBD4F" />
      <path d="M12.5 10.5c2.8 1.6 5.2 4.8 4.8 8.2-.2 2-1.4 3.6-3 4.6" stroke="#3E1F0F" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  ),
  webkit: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="#5AC8FA" opacity="0.25" />
      <circle cx="16" cy="16" r="9" stroke="#007AFF" strokeWidth="2.2" />
      <path d="M16 7v18M9 11l14 10M23 11L9 21" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.5" fill="#007AFF" />
    </svg>
  ),
};

export default function BrowserIcon({ id, size = 28, className = '' }) {
  const gradId = `edge-grad-${id}`;
  const icon = id === 'edge' ? ICONS.edge(gradId) : (ICONS[id] || ICONS.chromium);
  return (
    <span
      className={`browser-icon${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {icon}
    </span>
  );
}
