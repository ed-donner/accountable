import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, failureMessage, type Schemas } from "./api";
import {
  ConfirmDialog,
  contactDeleteMessage,
  dealDeleteMessage,
  organizationDeleteMessage,
} from "./ConfirmDialog";
import { useToast } from "./Toast";

export type Deletable = { kind: "organization" | "contact" | "deal"; id: number; name: string };

const PATHS = { organization: "organizations", contact: "contacts", deal: "deals" } as const;

function message(kind: Deletable["kind"], impact: unknown): string {
  if (kind === "organization") return organizationDeleteMessage(impact as Schemas["OrganizationImpact"]);
  if (kind === "contact") return contactDeleteMessage(impact as Schemas["ContactImpact"]);
  return dealDeleteMessage(impact as Schemas["DealImpact"]);
}

type Props = { record: Deletable; onClose: () => void; onDeleted?: () => void };

/** Asks first, using the record's delete impact, then deletes it (T6). */
export function DeleteRecord({ record, onClose, onDeleted }: Props) {
  const toast = useToast();
  const client = useQueryClient();
  const path = `/${PATHS[record.kind]}/${record.id}`;
  const impact = useQuery({
    queryKey: ["impact", record.kind, record.id],
    queryFn: () => api<unknown>(`${path}/delete-impact`),
    gcTime: 0,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: () => api<void>(path, "DELETE"),
    onSuccess: () => {
      onDeleted?.();
      onClose();
      toast.success(`Deleted ${record.name}.`);
      // Refresh everything except queries about the deleted record, which would only find it gone.
      const gone = (key: readonly unknown[]) =>
        key.includes(record.kind) && key.includes(record.id) && (key.length === 2 || key[0] === "timeline" || key[0] === "impact");
      void client.invalidateQueries({ predicate: (query) => !gone(query.queryKey) });
    },
    onError: (error) => toast.error(failureMessage(`delete ${record.name}`, error)),
  });

  useEffect(() => {
    if (impact.isError) {
      toast.error(failureMessage(`delete ${record.name}`, impact.error));
      onClose();
    }
  }, [impact.isError, impact.error, record.name, toast, onClose]);

  if (!impact.data) return null;
  return (
    <ConfirmDialog
      title={`Delete ${record.name}?`}
      message={message(record.kind, impact.data)}
      confirmLabel={`Delete ${record.kind}`}
      busy={remove.isPending}
      onConfirm={() => remove.mutate()}
      onCancel={onClose}
    />
  );
}
