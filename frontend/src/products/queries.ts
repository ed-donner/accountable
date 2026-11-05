import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "../lib/api";
import { useNotify } from "../lib/notify";
import { useWrite, type Authorship } from "../lib/records";

/** A unit price is always whole cents, never a decimal (G3). */
export type Product = {
  id: number;
  name: string;
  description: string | null;
  unit_price_cents: number;
  active: boolean;
};
export type ProductRow = Product;
export type ProductDetail = Product & Authorship;

type ProductValues = { name: string; description: string | null; unit_price_cents: number };

/** Long enough to reach Restore on the message from the keyboard, which doesn't pause it (G9). */
export const ARCHIVED_MESSAGE_MS = 10_000;

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => api<ProductRow[]>("/products") });
}

export function useProduct(id: number) {
  return useQuery({ queryKey: ["products", id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
}

export function useSaveProduct(id?: number) {
  return useWrite((values: ProductValues) =>
    id === undefined
      ? api<ProductDetail>("/products", { method: "POST", body: values })
      : api<ProductDetail>(`/products/${id}`, { method: "PATCH", body: values }),
  );
}

/**
 * Archives or restores a product, and says so (G9). Each happens once however quickly
 * it's asked for, because a button only disables once the page redraws. Archiving's
 * message has Restore on it, so a slip takes one click to put right.
 */
export function useSetActive() {
  const save = useWrite(({ id, active }: { id: number; active: boolean }) =>
    api<ProductDetail>(`/products/${id}`, { method: "PATCH", body: { active } }),
  );
  const asked = useRef(new Set<number>());
  const notify = useNotify();

  async function setActive(id: number, active: boolean) {
    if (asked.current.has(id)) return;
    asked.current.add(id);
    try {
      await save.mutateAsync({ id, active });
      if (active) notify.success("Product restored.");
      else
        notify.success("Product archived.", {
          duration: ARCHIVED_MESSAGE_MS,
          action: { label: "Restore", onClick: () => void setActive(id, true) },
        });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      asked.current.delete(id);
    }
  }

  return { setActive, pending: save.isPending };
}
