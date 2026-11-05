import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { api } from "../lib/api";
import { useNotify } from "../lib/notify";
import { useWrite, type Authorship } from "../lib/records";
import { useToday } from "../lib/useToday";

export type Category = "software" | "contractors" | "travel" | "office" | "marketing" | "other";

/** Amounts are always whole cents, and the total is the backend's: the amount plus the tax (E4). */
export type Bill = {
  id: number;
  organization: { id: number; name: string };
  bill_number: string;
  bill_date: string;
  due_date: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  category: Category;
  notes: string | null;
  /** Null while the bill is unpaid. */
  paid_on: string | null;
};
export type BillRow = Bill;
export type BillDetail = Bill & Authorship;

export type BillValues = {
  organization_id: number;
  bill_number: string;
  bill_date: string;
  due_date: string;
  amount_cents: number;
  tax_cents: number;
  category: Category;
  notes: string | null;
  paid_on: string | null;
};

export type Figure = { total_cents: number; count: number };
export type DueBill = {
  id: number;
  supplier: string;
  bill_number: string;
  due_date: string;
  category: Category;
  total_cents: number;
};
export type SpendingMonth = { month: string; label: string; total_cents: number; categories: Record<Category, number> };

/** The Money section's figures, worked out by the backend for its today (E20 to E23). */
export type MoneyFigures = {
  today: string;
  owed: Figure;
  overdue: Figure;
  due: Figure & { bills: DueBill[] };
  /** The last 12 months, oldest first. */
  months: SpendingMonth[];
};

/** Long enough to reach Undo on the message from the keyboard, which doesn't pause it (E10). */
export const UNPAID_MESSAGE_MS = 10_000;

export function useBills() {
  return useQuery({ queryKey: ["bills"], queryFn: () => api<BillRow[]>("/bills") });
}

/** An organization's bills, from the bills area's own route, for its Bills panel (E19). */
export function useOrganizationBills(organizationId: number) {
  return useQuery({
    queryKey: ["bills", "organization", organizationId],
    queryFn: () => api<BillRow[]>(`/bills?organization_id=${organizationId}`),
  });
}

export function useBill(id: number) {
  return useQuery({ queryKey: ["bills", id], queryFn: () => api<BillDetail>(`/bills/${id}`) });
}

export function useSaveBill(id?: number) {
  return useWrite((values: BillValues) =>
    id === undefined
      ? api<BillDetail>("/bills", { method: "POST", body: values })
      : api<BillDetail>(`/bills/${id}`, { method: "PATCH", body: values }),
  );
}

export function useMoney() {
  const money = useQuery({ queryKey: ["bills", "dashboard"], queryFn: () => api<MoneyFigures>("/bills/dashboard") });

  // The backend works the figures out for one day, so a new day means reading them again.
  const today = useToday();
  const figuresFor = money.data?.today;
  const { refetch } = money;
  useEffect(() => {
    if (figuresFor !== undefined && figuresFor < today) void refetch();
  }, [figuresFor, today, refetch]);

  return money;
}

type PaidChange = { id: number; paid_on: string | null };

/**
 * Marks a bill paid on a date, or unpaid, and says so (E9, E10). Each happens once however
 * quickly it's asked for, because a button only disables once the page redraws. Marking it
 * unpaid has Undo on its message, which puts back the date it had.
 */
export function usePaid() {
  const save = useWrite(({ id, paid_on }: PaidChange) =>
    api<BillDetail>(`/bills/${id}`, { method: "PATCH", body: { paid_on } }),
  );
  const asked = useRef(new Set<number>());
  const notify = useNotify();

  async function once(id: number, change: () => Promise<void>) {
    if (asked.current.has(id)) return;
    asked.current.add(id);
    try {
      await change();
    } finally {
      asked.current.delete(id);
    }
  }

  /** Throws if the save fails, so the dialog can say why beside the date. */
  function markPaid(id: number, paidOn: string) {
    return once(id, async () => {
      await save.mutateAsync({ id, paid_on: paidOn });
      notify.success("Bill marked paid.");
    });
  }

  function putBack(id: number, paidOn: string) {
    markPaid(id, paidOn).catch((error: unknown) => notify.error(messageOf(error)));
  }

  function markUnpaid(id: number, paidOn: string) {
    return once(id, async () => {
      try {
        await save.mutateAsync({ id, paid_on: null });
        notify.success("Bill marked unpaid.", {
          duration: UNPAID_MESSAGE_MS,
          action: { label: "Undo", onClick: () => putBack(id, paidOn) },
        });
      } catch (error) {
        notify.error(messageOf(error));
      }
    });
  }

  return { markPaid, markUnpaid, pending: save.isPending };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
