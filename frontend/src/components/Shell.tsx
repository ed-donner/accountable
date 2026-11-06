import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { Toaster } from "sonner";

import { formatDate } from "../lib/dates";
import { useToday } from "../lib/useToday";
import { ConnectionMessage } from "./ConnectionMessage";
import { UserMenu, type MenuGroup } from "./UserMenu";

/** A section of the app, as the top bar links to it. Its icon is 17px, as Icon draws its own. */
export type Section = { to: string; label: string; icon: ReactNode };

/**
 * The top bar and the page under it. The sections, the search box and the groups of links in the user's
 * menu come from App.tsx, because they know about each area. Below 1536px wide the links drop their icons and
 * close up, so nine sections fit at every width from 1280px, even beside the widest date (N1).
 */
type Props = { sections: Section[]; search: ReactNode; menuLinks: MenuGroup[] };

export function Shell({ sections, search, menuLinks }: Props) {
  const today = useToday();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-5 mt-3 flex h-14 flex-none items-center gap-7 rounded-panel bg-panel pr-[18px] pl-5">
        <div className="text-[19px] leading-6 font-semibold">Accountable</div>
        <nav aria-label="Sections" className="flex gap-0.5">
          {sections.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex h-9 items-center gap-[7px] rounded-control px-2 font-medium min-[1536px]:px-3 ${
                  isActive ? "bg-sea-green font-semibold text-midnight" : "hover:bg-page"
                }`
              }
            >
              <span className="contents max-[1536px]:hidden">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {search}
          <span className="num text-[13px] whitespace-nowrap text-muted">{formatDate(today)}</span>
          <UserMenu groups={menuLinks} />
        </div>
      </header>
      <ConnectionMessage />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      <Toaster position="bottom-center" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
