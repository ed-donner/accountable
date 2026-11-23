import type { UseFormRegisterReturn } from "react-hook-form";
import { Field, fieldProps } from "../shared/Field";
import { ListRetry } from "../shared/ListRetry";
import { useOrganizations } from "./hooks";

type Props = {
  id: string;
  registration: UseFormRegisterReturn;
  error?: string;
  required?: boolean;
  /** The first choice, for no organization picked yet. */
  emptyLabel: string;
};

/** Picks an organization by name, with Retry when the list didn't load. */
export function OrganizationSelect({ id, registration, error, required, emptyLabel }: Props) {
  const organizations = useOrganizations();
  const sorted = [...(organizations.data?.items ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <Field id={id} label="Organization" required={required} error={error}>
      <select {...fieldProps(id, error)} {...registration}>
        <option value="">{emptyLabel}</option>
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {organizations.isError && (
        <ListRetry
          what="organizations"
          onRetry={() => organizations.refetch()}
          retrying={organizations.isFetching}
        />
      )}
    </Field>
  );
}
