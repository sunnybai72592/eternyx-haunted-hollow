import { LayoutDashboard, Bug } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const items = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/bug-reports', label: 'Bug reports', icon: Bug, exact: false },
];

export default function AdminWorkspaceNav() {
  const location = useLocation();
  return (
    <nav aria-label="Administrator workspace" className="mb-7 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? location.pathname === href : location.pathname === href || location.pathname.startsWith(href + '/');
        return <Link key={href} to={href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${active ? 'border-cyan-200/25 bg-cyan-200/[0.09] text-cyan-100' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-white'}`}>
          <Icon className="h-4 w-4" />{label}
        </Link>;
      })}
    </nav>
  );
}
