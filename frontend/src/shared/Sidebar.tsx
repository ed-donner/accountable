import { NavLink } from "react-router-dom";
import { Building2, DollarSign, LayoutDashboard, SquareKanban, User } from "lucide-react";

const LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/pipeline", label: "Pipeline", icon: SquareKanban, end: false },
  { to: "/deals", label: "Deals", icon: DollarSign, end: false },
  { to: "/contacts", label: "Contacts", icon: User, end: false },
  { to: "/organizations", label: "Organizations", icon: Building2, end: false },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          A
        </span>
        Accountable
      </div>
      <nav aria-label="Sections">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? "on" : undefined)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
