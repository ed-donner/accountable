import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/organizations", label: "Organizations", end: false },
  { to: "/contacts", label: "Contacts", end: false },
  { to: "/deals", label: "Deals", end: false },
  { to: "/pipeline", label: "Pipeline", end: false },
];

export function TopBar() {
  return (
    <header className="on-band flex h-16 items-center gap-11 bg-band px-8">
      <NavLink
        to="/"
        className="flex items-center gap-2.5 text-[18px] font-semibold text-band-ink"
        aria-label="Accountable, go to the dashboard"
      >
        <span aria-hidden className="grid size-6 place-items-center rounded-[7px] bg-sea-green">
          <span className="size-2.5 rounded-[3px] bg-band" />
        </span>
        Accountable
      </NavLink>
      <nav aria-label="Sections" className="flex gap-1">
        {SECTIONS.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            end={section.end}
            className={({ isActive }) =>
              cn(
                "rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-150",
                isActive
                  ? "bg-sea-green font-semibold text-midnight"
                  : "text-band-ink-soft hover:bg-band-rest hover:text-band-ink",
              )
            }
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
