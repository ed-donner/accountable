import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormActions, FormError, fieldProps } from "../shared/Field";
import { ListRetry } from "../shared/ListRetry";
import { Loading } from "../shared/Loading";
import { applyServerErrors, errorMessages } from "../shared/forms";
import { STAGES, stageInfo, type Stage } from "../shared/stages";
import { useToast } from "../shared/Toast";
import { dealSchema, idOrNull, orNull, toWholeNumber, type DealValues } from "../shared/validation";
import { useOrganizations } from "../organizations/hooks";
import { OrganizationSelect } from "../organizations/OrganizationSelect";
import { useContacts } from "../contacts/hooks";
import { useSaveDeal, type DealRow } from "./hooks";

type Props = {
  deal?: DealRow;
  /** Presets when adding from an organization, a contact or a pipeline column. */
  preset?: {
    organizationId?: number | null;
    contactId?: number | null;
    stage?: Stage;
  };
  onSaved: (saved: DealRow) => void;
  onCancel: () => void;
};

const FIELDS = [
  "name",
  "organization_id",
  "contact_id",
  "stage",
  "value",
  "probability",
  "close_date",
] as const;

type ContactOption = {
  id: number;
  name: string;
  organization_id: number | null;
};

/** D2: the chosen organization's contacts first, then everyone else. */
export function orderContacts(contacts: ContactOption[], organizationId: number | null) {
  const byName = (a: ContactOption, b: ContactOption) => a.name.localeCompare(b.name);
  const atOrg =
    organizationId === null
      ? []
      : contacts.filter((c) => c.organization_id === organizationId).sort(byName);
  const others = contacts
    .filter((c) => organizationId === null || c.organization_id !== organizationId)
    .sort(byName);
  return { atOrg, others };
}

type Preset = Props["preset"];

/** An edited deal starts from its saved values; a new one from its presets. */
function dealDefaults(deal?: DealRow, preset?: Preset): DealValues {
  return deal ? savedDealValues(deal) : newDealValues(preset);
}

function savedDealValues(deal: DealRow): DealValues {
  return {
    name: deal.name,
    organization_id: String(deal.organization_id ?? ""),
    contact_id: String(deal.contact_id ?? ""),
    stage: deal.stage,
    value: String(deal.value),
    probability: String(deal.probability),
    close_date: deal.close_date ?? "",
  };
}

function newDealValues(preset?: Preset): DealValues {
  return {
    name: "",
    organization_id: String(preset?.organizationId ?? ""),
    contact_id: String(preset?.contactId ?? ""),
    stage: preset?.stage ?? "new",
    value: "",
    probability: "",
    close_date: "",
  };
}

function dealBody(values: DealValues) {
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
  return body;
}

function ContactOptions({ contacts }: { contacts: ContactOption[] }) {
  return contacts.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));
}

type ContactSelectProps = {
  registration: UseFormRegisterReturn;
  error?: string;
  /** The chosen organization's id, as the select holds it. */
  organizationId: string;
};

/** The main contact, with the chosen organization's people listed first (D2). */
function ContactSelect({ registration, error, organizationId }: ContactSelectProps) {
  const organizations = useOrganizations();
  const contacts = useContacts();
  const options = useMemo(
    () => orderContacts(contacts.data?.items ?? [], organizationId ? Number(organizationId) : null),
    [contacts.data, organizationId],
  );
  const orgName = organizations.data?.items.find((o) => String(o.id) === organizationId)?.name;
  const hasAtOrg = options.atOrg.length > 0;
  return (
    <Field id="deal-contact" label="Main contact" error={error}>
      <select {...fieldProps("deal-contact", error)} {...registration}>
        <option value="">No main contact</option>
        {hasAtOrg && (
          <optgroup label={`At ${orgName ?? "this organization"}`}>
            <ContactOptions contacts={options.atOrg} />
          </optgroup>
        )}
        <optgroup label={hasAtOrg ? "Everyone else" : "Contacts"}>
          <ContactOptions contacts={options.others} />
        </optgroup>
      </select>
      {contacts.isError && (
        <ListRetry
          what="contacts"
          onRetry={() => contacts.refetch()}
          retrying={contacts.isFetching}
        />
      )}
    </Field>
  );
}

type ProbabilityFieldProps = {
  registration: UseFormRegisterReturn;
  error?: string;
  editing: boolean;
  stage: Stage;
};

function ProbabilityField({ registration, error, editing, stage }: ProbabilityFieldProps) {
  const usual = stageInfo(stage).usualProbability;
  return (
    <Field
      id="deal-probability"
      label="Probability (%)"
      error={error}
      hint={editing ? "Changing the stage resets it" : `Leave blank for ${usual}%`}
    >
      <input
        inputMode="numeric"
        {...fieldProps("deal-probability", error)}
        {...registration}
        placeholder={String(usual)}
        autoComplete="off"
      />
    </Field>
  );
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
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DealValues>({
    resolver: zodResolver(dealSchema(organizationRequired)),
    defaultValues: dealDefaults(deal, preset),
  });
  const organizationId = useWatch({ control, name: "organization_id" });
  const stage = useWatch({ control, name: "stage" });
  const errorOf = errorMessages(errors);

  const onSubmit = async (values: DealValues) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({ id: deal?.id, body: dealBody(values) });
      toast.success(deal ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  // After a Retry brings the choices in, show the preset ones as chosen again.
  const orgCount = organizations.data?.items.length ?? 0;
  const contactCount = contacts.data?.items.length ?? 0;
  useEffect(() => {
    setValue("organization_id", getValues("organization_id"));
    setValue("contact_id", getValues("contact_id"));
  }, [orgCount, contactCount, getValues, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormError message={formError} />
      <Field id="deal-name" label="Name" required error={errorOf("name")}>
        <input
          {...fieldProps("deal-name", errorOf("name"))}
          {...register("name")}
          autoComplete="off"
        />
      </Field>
      <OrganizationSelect
        id="deal-organization"
        registration={register("organization_id")}
        error={errorOf("organization_id")}
        required={organizationRequired}
        emptyLabel={organizationRequired ? "Choose an organization" : "No organization"}
      />
      <ContactSelect
        registration={register("contact_id")}
        error={errorOf("contact_id")}
        organizationId={organizationId}
      />
      <div className="row-2">
        <Field id="deal-stage" label="Stage" required error={errorOf("stage")}>
          <select {...fieldProps("deal-stage", errorOf("stage"))} {...register("stage")}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="deal-value" label="Value (US dollars)" required error={errorOf("value")}>
          <input
            inputMode="numeric"
            {...fieldProps("deal-value", errorOf("value"))}
            {...register("value")}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="row-2">
        <ProbabilityField
          registration={register("probability")}
          error={errorOf("probability")}
          editing={deal !== undefined}
          stage={stage}
        />
        <Field id="deal-close-date" label="Close date" error={errorOf("close_date")}>
          <input
            type="date"
            {...fieldProps("deal-close-date", errorOf("close_date"))}
            {...register("close_date")}
          />
        </Field>
      </div>
      <FormActions
        submitLabel={deal ? "Save deal" : "Add deal"}
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}

/**
 * Waits for the lists its selects offer, so a preset organization or contact shows
 * as chosen. Only the first load waits: a failed list goes back to "pending" when
 * it's fetched again, and swapping the form for Loading then would loop forever.
 */
export function DealForm(props: Props) {
  const organizations = useOrganizations();
  const contacts = useContacts();
  const [loaded, setLoaded] = useState(false);
  const pending = organizations.isPending || contacts.isPending;
  if (!loaded && !pending) setLoaded(true);
  if (!loaded && pending) return <Loading />;
  return <DealFormFields {...props} />;
}
