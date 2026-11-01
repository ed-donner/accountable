import { Building2, CircleDollarSign, LayoutDashboard, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { Toaster } from "sonner";

import { useMeta } from "../crm/queries";
import { formatDay } from "../lib/dates";
import { ConnectionMessage } from "./ConnectionMessage";

function PipelineIcon(props: { size: number; strokeWidth: number }) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </svg>
  );
}

const SECTIONS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/deals", label: "Deals", icon: CircleDollarSign },
  { to: "/pipeline", label: "Pipeline", icon: PipelineIcon },
];

export function Shell() {
  useMeta(); // Fetched early, because it never changes and forms need it straight away.

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-5 mt-3 flex h-14 flex-none items-center gap-7 rounded-panel bg-panel pr-[18px] pl-5">
        <div className="text-[19px] leading-6 font-semibold">Accountable</div>
        <nav aria-label="Sections" className="flex gap-0.5">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
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
              <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="num ml-auto text-[13px] text-muted">{formatDay(new Date())}</span>
      </header>
      <ConnectionMessage />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      <Toaster position="bottom-center" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
