import { NavLink, Outlet } from "react-router";
import { Toaster } from "sonner";

import { formatDate } from "../lib/dates";
import { useToday } from "../lib/useToday";
import { ConnectionMessage } from "./ConnectionMessage";
import { Icon, type IconName } from "./Icon";

const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/organizations", label: "Organizations", icon: "organizations" },
  { to: "/contacts", label: "Contacts", icon: "contacts" },
  { to: "/deals", label: "Deals", icon: "deals" },
  { to: "/pipeline", label: "Pipeline", icon: "pipeline" },
];

export function Shell() {
  const today = useToday();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-5 mt-3 flex h-14 flex-none items-center gap-7 rounded-panel bg-panel pr-[18px] pl-5">
        <div className="text-[19px] leading-6 font-semibold">Accountable</div>
        <nav aria-label="Sections" className="flex gap-0.5">
          {SECTIONS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex h-9 items-center gap-[7px] rounded-control px-3 font-medium ${
                  isActive ? "bg-sea-green font-semibold" : "hover:bg-page"
                }`
              }
            >
              <Icon name={icon} size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="num ml-auto text-[13px] text-muted">{formatDate(today)}</span>
      </header>
      <ConnectionMessage />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      <Toaster position="bottom-center" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
