import { useQuery } from "@tanstack/react-query";
import { Check, Monitor, Moon, Sun, UserRound, type LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useId, useState } from "react";
import { useNavigate } from "react-router";

import { api } from "../lib/api";
import { signOut } from "../lib/session";
import { THEMES, savedTheme, setTheme, type Theme } from "../lib/theme";

/** The signed-in person, from GET /me. The name already falls back to the email (U8). */
type Me = { id: string; name: string; email: string; initials: string };

const THEME_CHOICES: Record<Theme, { label: string; Icon: LucideIcon }> = {
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
  system: { label: "System", Icon: Monitor },
};

const ITEM = "flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 outline-none data-highlighted:bg-page";

function isTheme(value: string): value is Theme {
  return (THEMES as string[]).includes(value);
}

/** The initials button at the end of the top bar, and its menu: who's signed in, the theme, Company settings and Sign out (N7). */
export function UserMenu() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const [theme, setShownTheme] = useState(savedTheme);
  const navigate = useNavigate();
  const themeLabel = useId();

  function chooseTheme(value: string) {
    if (!isTheme(value)) return;
    setTheme(value);
    setShownTheme(value);
  }

  function signOutHere() {
    // The router outlives the session, so it moves too, or signing in again would reopen this page (U5).
    void navigate("/");
    void signOut();
  }

  const person = me.data;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        // Until the backend says who's signed in, or if it can't, the menu still holds the theme (L1).
        aria-label={person ? `Menu for ${person.name}` : "Menu"}
        className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-marigold text-[13px] leading-[18px] font-semibold text-midnight"
      >
        {person ? person.initials : <UserRound size={16} aria-hidden="true" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-60 rounded-card bg-raised p-1.5 shadow-(--shadow-popover)"
        >
          {person && (
            <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1">
              <span className="block truncate font-semibold">{person.name}</span>
              {person.email !== person.name && (
                <span className="block truncate text-[13px] leading-[18px] text-muted">{person.email}</span>
              )}
            </DropdownMenu.Label>
          )}
          <DropdownMenu.Label
            id={themeLabel}
            className={`px-2.5 py-1 text-[13px] leading-[18px] font-semibold text-muted ${person ? "mt-2.5" : ""}`}
          >
            Theme
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup aria-labelledby={themeLabel} value={theme} onValueChange={chooseTheme}>
            {THEMES.map((choice) => {
              const { label, Icon } = THEME_CHOICES[choice];
              return (
                <DropdownMenu.RadioItem key={choice} value={choice} className={ITEM}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                  <DropdownMenu.ItemIndicator className="ml-auto inline-flex">
                    <Check size={15} aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Item onSelect={() => void navigate("/settings")} className={`mt-2.5 ${ITEM}`}>
            Company settings
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={signOutHere} className={ITEM}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
