import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, fieldProps } from "../shared/Field";
import { Loading } from "../shared/Loading";
import { applyServerErrors } from "../shared/forms";
import { STAGES, stageInfo, type Stage } from "../shared/stages";
import { useToast } from "../shared/Toast";
import { dealSchema, idOrNull, orNull, toWholeNumber, type DealValues } from "../shared/validation";
import { useOrganizations } from "../organizations/hooks";
import { useContacts } from "../contacts/hooks";
import { useSaveDeal, type DealRow } from "./hooks";

type Props = {
  deal?: DealRow;
  /** Presets when adding from an organization, a contact or a pipeline column. */
  preset?: { organizationId?: number | null; contactId?: number | null; stage?: Stage };
  onSaved: (saved: DealRow) => void;
  onCancel: () => void;
};

const FIELDS = ["name", "organization_id", "contact_id", "stage", "value", "probability", "close_date"] as const;

type ContactOption = { id: number; name: string; organization_id: number | null };

/** D2: the chosen organization's contacts first, then everyone else. */
export function orderContacts(contacts: ContactOption[], organizationId: number | null) {
  const byName = (a: ContactOption, b: ContactOption) => a.name.localeCompare(b.name);
  const atOrg = organizationId === null ? [] : contacts.filter((c) => c.organization_id === organizationId).sort(byName);
  const others = contacts.filter((c) => organizationId === null || c.organization_id !== organizationId).sort(byName);
  return { atOrg, others };
}

function DealFormFields({ deal, preset, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveDeal();
  const organizations = useOrganizations();
  const contacts = useContacts();
  const [formError, setFormError] = useState<string | null>(null);
  // Concern 1: required, unless the deal has already lost its organization.
  const organizationRequired = !deal || deal.organization_id !== null;
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DealValues>({
    resolver: zodResolver(dealSchema(organizationRequired)),
    defaultValues: {
      name: deal?.name ?? "",
      organization_id: String(deal?.organization_id ?? preset?.organizationId ?? ""),
      contact_id: String(deal?.contact_id ?? preset?.contactId ?? ""),
      stage: deal?.stage ?? preset?.stage ?? "new",
      value: deal ? String(deal.value) : "",
      probability: deal ? String(deal.probability) : "",
      close_date: deal?.close_date ?? "",
    },
  });
  const organizationId = useWatch({ control, name: "organization_id" });
  const stage = useWatch({ control, name: "stage" });

  const options = useMemo(
    () => orderContacts(contacts.data?.items ?? [], organizationId ? Number(organizationId) : null),
    [contacts.data, organizationId],
  );
  const orgName = organizations.data?.items.find((o) => String(o.id) === organizationId)?.name;

  const onSubmit = async (values: DealValues) => {
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        organization_id: idOrNull(values.organization_id),
        contact_id: idOrNull(values.contact_id),
        stage: values.stage,
        value: toWholeNumber(values.value),
        close_date: orNull(values.close_date),
      };
      // Left blank, the backend uses the stage's usual probability (D3).
      if (values.probability.trim() !== "") body.probability = toWholeNumber(values.probability);
      const saved = await save.mutateAsync({ id: deal?.id, body });
      toast.success(deal ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  const orgs = [...(organizations.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const e = errors;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      <Field id="deal-name" label="Name" required error={e.name?.message}>
        <input {...fieldProps("deal-name", e.name?.message)} {...register("name")} autoComplete="off" autoFocus />
      </Field>
      <Field id="deal-organization" label="Organization" required={organizationRequired} error={e.organization_id?.message}>
        <select {...fieldProps("deal-organization", e.organization_id?.message)} {...register("organization_id")}>
          <option value="">{organizationRequired ? "Choose an organization" : "No organization"}</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="deal-contact" label="Main contact" error={e.contact_id?.message}>
        <select {...fieldProps("deal-contact", e.contact_id?.message)} {...register("contact_id")}>
          <option value="">No main contact</option>
          {options.atOrg.length > 0 && (
            <optgroup label={`At ${orgName ?? "this organization"}`}>
              {options.atOrg.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={options.atOrg.length ? "Everyone else" : "Contacts"}>
            {options.others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <div className="row-2">
        <Field id="deal-stage" label="Stage" required error={e.stage?.message}>
          <select {...fieldProps("deal-stage", e.stage?.message)} {...register("stage")}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="deal-value" label="Value (US dollars)" required error={e.value?.message}>
          <input inputMode="numeric" {...fieldProps("deal-value", e.value?.message)} {...register("value")} autoComplete="off" />
        </Field>
      </div>
      <div className="row-2">
        <Field
          id="deal-probability"
          label="Probability (%)"
          error={e.probability?.message}
          hint={deal ? "Changing the stage resets it" : `Leave blank for ${stageInfo(stage).usualProbability}%`}
        >
          <input
            inputMode="numeric"
            {...fieldProps("deal-probability", e.probability?.message)}
            {...register("probability")}
            placeholder={String(stageInfo(stage).usualProbability)}
            autoComplete="off"
          />
        </Field>
        <Field id="deal-close-date" label="Close date" error={e.close_date?.message}>
          <input type="date" {...fieldProps("deal-close-date", e.close_date?.message)} {...register("close_date")} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={isSubmitting}>
          {deal ? "Save deal" : "Add deal"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Waits for the lists its selects offer, so a preset organization or contact shows as chosen. */
export function DealForm(props: Props) {
  const organizations = useOrganizations();
  const contacts = useContacts();
  if (organizations.isPending || contacts.isPending) return <Loading />;
  return <DealFormFields {...props} />;
}
