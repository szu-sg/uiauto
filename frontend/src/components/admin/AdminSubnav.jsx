import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/admin/spaces', label: '项目空间' },
  { to: '/admin/users', label: '平台用户' },
  { to: '/admin/plans', label: '测试计划' },
];

export default function AdminSubnav() {
  return (
    <nav className="admin-subnav" aria-label="平台管理">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `admin-subnav__link${isActive ? ' admin-subnav__link--active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
