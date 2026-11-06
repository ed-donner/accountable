import type { MenuGroup } from "../components/UserMenu";

/** The Accounting pages, in the order the menu lists them (J15). */
export const ACCOUNTING_LINKS: MenuGroup = {
  label: "Accounting",
  links: [
    { label: "Profit and loss", to: "/accounting/profit-and-loss" },
    { label: "Balance sheet", to: "/accounting/balance-sheet" },
    { label: "Journal", to: "/accounting/journal" },
    { label: "Aged balances", to: "/accounting/aged-balances" },
  ],
};

/** An account's ledger, from its key (J15). It has no link in the menu. */
export function ledgerPath(key: string): string {
  return `/accounting/accounts/${key}`;
}
