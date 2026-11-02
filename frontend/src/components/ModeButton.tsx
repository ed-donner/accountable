import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { savedMode, setMode, type Mode } from "../lib/mode";

const OTHER: Record<Mode, Mode> = { light: "dark", dark: "light" };

/** Shows a moon in light mode and a sun in dark mode, and says what a press will do. */
export function ModeButton() {
  const [mode, setShownMode] = useState(savedMode);
  const next = OTHER[mode];
  const Icon = mode === "light" ? Moon : Sun;

  function switchMode() {
    setMode(next);
    setShownMode(next);
  }

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={switchMode}
      className="inline-flex size-8 items-center justify-center rounded-full hover:bg-page"
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
