import type { ReactNode } from "react";

// The chosen design's own icons, from docs/mockups/shared.js. Icons the design
// doesn't show, such as edit and delete, come from lucide-react.
const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  organizations: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
      <path d="M15 9h3a2 2 0 0 1 2 2v10" />
      <path d="M2 21h20M8 7h3M8 11h3M8 15h3" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 4a4 4 0 0 1 0 8M18 15a7 7 0 0 1 4 6" />
    </>
  ),
  deals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9a3 2.4 0 0 0-3-1.6c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2a3 2.4 0 0 1-3-1.6M12 6v12" />
    </>
  ),
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  call: <path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a3 3 0 0 1-3 3A15 15 0 0 1 3 6a3 3 0 0 1 3-3z" />,
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  note: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" />,
  stage: <path d="M4 12h14M13 6l6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
