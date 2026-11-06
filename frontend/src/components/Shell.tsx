import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { Toaster } from "sonner";

import { formatDate } from "../lib/dates";
import { useToday } from "../lib/useToday";
import { ConnectionMessage } from "./ConnectionMessage";
import { UserMenu, type MenuGroup } from "./UserMenu";

/** A section of the app, as the top bar links to it. Its icon is 17px, as Icon draws its own. */
export type Section = { to: string; label: string; icon: ReactNode };

/** Whether the Copilot's panel is open. The shell keeps it, because the page makes room for the panel (Z1). */
export type CopilotPanelState = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * The top bar and the page under it. The sections, the search box, the Copilot and the groups of links in
 * the user's menu come from App.tsx, because they know about each area. Below 1536px wide the links drop
 * their icons and close up, so nine sections fit at every width from 1280px, even beside the widest date (N1).
 */
type Props = {
  sections: Section[];
  search: ReactNode;
  copilot: (panel: CopilotPanelState) => ReactNode;
  menuLinks: MenuGroup[];
};

// The page area ends where the panel begins, its 400px and 20px from the window's edge, so the page keeps its
// own 20px edge beside the panel. It narrows in step with the panel's slide, and at once under reduced motion.
const BESIDE_PANEL = "mr-[420px] duration-200 ease-out";
const WITHOUT_PANEL = "duration-200 ease-in";
// Beside the panel, a page wider than the room left, such as the Dashboard at 1280px, scrolls sideways in
// the page area. Not a page with a sticky part, such as a quote's preview, which a sideways scroller would
// keep from sticking. Those pages fit beside the panel.
const SCROLLS_SIDEWAYS = "[&:not(:has(.sticky))]:overflow-x-auto";

export function Shell({ sections, search, copilot, menuLinks }: Props) {
  const today = useToday();
  const [copilotOpen, setCopilotOpen] = useState(false);
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
          {copilot({ open: copilotOpen, onOpenChange: setCopilotOpen })}
          <UserMenu groups={menuLinks} />
        </div>
      </header>
      <div
        className={`flex min-h-0 flex-1 flex-col transition-[margin-right] ${copilotOpen ? BESIDE_PANEL : WITHOUT_PANEL}`}
      >
        <ConnectionMessage />
        <main className={`flex min-h-0 flex-1 flex-col ${copilotOpen ? SCROLLS_SIDEWAYS : ""}`}>
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-center" toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
