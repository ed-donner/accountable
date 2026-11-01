import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "../../components/Field";
import { FormDialog } from "../../components/FormDialog";
import { RecordPicker } from "../../components/RecordPicker";
import { todayIso } from "../../lib/dates";
import { STAGES, STAGE_NAMES, isOpen } from "../deals";
import {
  useContacts,
  useMeta,
  useOrganizations,
  useSaveDeal,
  type ContactRow,
  type Deal,
  type Meta,
  type OrganizationRow,
  type Stage,
} from "../queries";
import { ContactForm } from "./ContactForm";
import { OrganizationForm } from "./OrganizationForm";
import { link } from "./links";
import { showSaveError } from "./server-errors";
import { useCloseIfUnreadable } from "./useCloseIfUnreadable";

const VALUE_MESSAGE = "Enter a whole number of dollars, zero or more";
const PROBABILITY_MESSAGE = "Enter a whole number from 0 to 100";

const FUTURE_CLOSE = "A won or lost deal can't have a close date in the future";

/** A link that's set can't be cleared, but one left blank by a delete can stay blank. */
function dealSchema(record?: Deal) {
  return z
    .object({
      name: z.string().trim().min(1, "Enter a name"),
      organization_id: link(record !== undefined && record.organization_id === null, "Choose an organization"),
      main_contact_id: link(record !== undefined && record.main_contact_id === null, "Choose a main contact"),
      stage: z.enum(["new", "qualified", "proposal", "negotiation", "won", "lost"]),
      value: z
        .string()
        .transform((text) => text.replace(/[$,\s]/g, ""))
        .pipe(z.string().regex(/^\d+$/, VALUE_MESSAGE))
        .transform(Number),
      probability: z
        .string()
        .trim()
        .regex(/^\d+$/, PROBABILITY_MESSAGE)
        .transform(Number)
        .pipe(z.number().max(100, PROBABILITY_MESSAGE)),
      close_date: z.string().min(1, "Choose a close date"),
    })
    .refine((deal) => isOpen(deal.stage) || deal.close_date <= todayIso(), {
      path: ["close_date"],
      message: FUTURE_CLOSE,
    });
}

type Input = z.input<ReturnType<typeof dealSchema>>;
type Output = z.output<ReturnType<typeof dealSchema>>;

type Props = {
  record?: Deal;
  defaultStage?: Stage;
  defaultOrganizationId?: number;
  defaultContactId?: number;
  onClose: () => void;
  onSaved?: (saved: Deal) => void;
};

/** The form's starting values need these, and it only reads them once. */
export function DealForm(props: Props) {
  const meta = useMeta();
  const contacts = useContacts();
  const organizations = useOrganizations();
  useCloseIfUnreadable([meta, contacts, organizations], props.onClose);

  if (!meta.data || !contacts.data || !organizations.data) return null;
  return <LoadedDealForm {...props} meta={meta.data} contacts={contacts.data} organizations={organizations.data} />;
}

function LoadedDealForm({
  record,
  defaultStage,
  defaultOrganizationId,
  defaultContactId,
  onClose,
  onSaved,
  meta,
  contacts,
  organizations,
}: Props & { meta: Meta; contacts: ContactRow[]; organizations: OrganizationRow[] }) {
  const save = useSaveDeal(record?.id);
  const [adding, setAdding] = useState<{ kind: "organization" | "contact"; name: string } | null>(null);

  const usualProbability = (stage: Stage) => meta.stages.find((item) => item.key === stage)?.probability;

  const startStage = record?.stage ?? defaultStage ?? "new";
  const lastStage = useRef<Stage>(startStage);
  const lastOpenDate = useRef(record?.close_date ?? "");
  const startOrganization =
    record?.organization_id ??
    defaultOrganizationId ??
    contacts.find((contact) => contact.id === defaultContactId)?.organization_id ??
    null;

  const {
    register,
    handleSubmit,
    control,
    setError,
    getValues,
    setValue,
    watch,
    clearErrors,
    formState: { errors },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(dealSchema(record)),
    defaultValues: {
      name: record?.name ?? "",
      organization_id: record ? record.organization_id : startOrganization,
      main_contact_id: record ? record.main_contact_id : (defaultContactId ?? null),
      stage: startStage,
      value: record ? String(record.value) : "",
      probability: String(record?.probability ?? usualProbability(startStage) ?? ""),
      close_date: record?.close_date ?? (isOpen(startStage) ? "" : todayIso()),
    },
  });

  const organizationId = watch("organization_id");

  const contactOptions = useMemo(() => {
    const narrowed =
      organizationId === null ? contacts : contacts.filter((contact) => contact.organization_id === organizationId);
    return narrowed.map((contact) => ({ id: contact.id, name: contact.name, hint: contact.organization_name }));
  }, [contacts, organizationId]);

  const selectedContact = contacts.find((contact) => contact.id === watch("main_contact_id"));
  const pickerContacts =
    selectedContact && !contactOptions.some((option) => option.id === selectedContact.id)
      ? [...contactOptions, { id: selectedContact.id, name: selectedContact.name, hint: selectedContact.organization_name }]
      : contactOptions;

  function changeStage(stage: Stage) {
    const backToStart = record?.stage === stage;
    const probability = backToStart ? record.probability : usualProbability(stage);
    if (probability !== undefined) setValue("probability", String(probability), { shouldValidate: true });

    // The date only changes on the way into or out of Won and Lost. Moving between
    // open stages leaves it alone, along with anything typed into it.
    const leaving = lastStage.current;
    lastStage.current = stage;
    if (isOpen(leaving) && isOpen(stage)) return;
    if (isOpen(leaving)) lastOpenDate.current = getValues("close_date");
    const closed = backToStart ? record.close_date : todayIso();
    setValue("close_date", isOpen(stage) ? lastOpenDate.current : closed);
    clearErrors("close_date");
  }

  function chooseContact(contactId: number) {
    setValue("main_contact_id", contactId);
    clearErrors("main_contact_id");
    const contact = contacts.find((item) => item.id === contactId);
    if (organizationId === null && contact?.organization_id) {
      setValue("organization_id", contact.organization_id);
      clearErrors("organization_id");
    }
  }

  async function submit(values: Output) {
    try {
      const saved = await save.mutateAsync(values);
      toast.success("Deal saved.");
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues });
    }
  }

  const organizationPlaceholder = record && record.organization_id === null ? "None" : "Choose an organization";
  const contactPlaceholder = record && record.main_contact_id === null ? "None" : "Choose a main contact";

  return (
    <FormDialog
      title={record ? "Edit deal" : "Add deal"}
      submitLabel="Save deal"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Field label="Name" htmlFor="deal-name" error={errors.name?.message}>
        <input id="deal-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Organization" htmlFor="deal-organization" error={errors.organization_id?.message}>
          <Controller
            control={control}
            name="organization_id"
            render={({ field }) => (
              <RecordPicker
                id="deal-organization"
                label="Organization"
                noun="organization"
                value={field.value}
                options={organizations}
                placeholder={organizationPlaceholder}
                invalid={!!errors.organization_id}
                onChange={(id) => {
                  field.onChange(id);
                  clearErrors("organization_id");
                }}
                onAdd={(name) => setAdding({ kind: "organization", name })}
              />
            )}
          />
        </Field>
        <Field label="Main contact" htmlFor="deal-contact" error={errors.main_contact_id?.message}>
          <RecordPicker
            id="deal-contact"
            label="Main contact"
            noun="contact"
            value={watch("main_contact_id")}
            options={pickerContacts}
            placeholder={contactPlaceholder}
            invalid={!!errors.main_contact_id}
            onChange={chooseContact}
            onAdd={(name) => setAdding({ kind: "contact", name })}
          />
        </Field>
        <Field label="Stage" htmlFor="deal-stage" error={errors.stage?.message}>
          <select
            id="deal-stage"
            className="input"
            {...register("stage", { onChange: (event) => changeStage(event.target.value as Stage) })}
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_NAMES[stage]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value" htmlFor="deal-value" error={errors.value?.message}>
          <input
            id="deal-value"
            inputMode="numeric"
            className="input num"
            aria-invalid={!!errors.value}
            {...register("value")}
          />
        </Field>
        <Field label="Probability" htmlFor="deal-probability" error={errors.probability?.message}>
          <input
            id="deal-probability"
            inputMode="numeric"
            className="input num"
            aria-invalid={!!errors.probability}
            {...register("probability")}
          />
        </Field>
        <Field label="Close date" htmlFor="deal-close-date" error={errors.close_date?.message}>
          <input
            id="deal-close-date"
            type="date"
            className="input num"
            aria-invalid={!!errors.close_date}
            {...register("close_date")}
          />
        </Field>
      </div>
      {adding?.kind === "organization" && (
        <OrganizationForm
          defaultName={adding.name}
          onClose={() => setAdding(null)}
          onSaved={(saved) => {
            setValue("organization_id", saved.id);
            clearErrors("organization_id");
          }}
        />
      )}
      {adding?.kind === "contact" && (
        <ContactForm
          defaultName={adding.name}
          defaultOrganizationId={organizationId}
          onClose={() => setAdding(null)}
          onSaved={(saved) => {
            setValue("main_contact_id", saved.id);
            clearErrors("main_contact_id");
            if (organizationId === null && saved.organization_id) {
              setValue("organization_id", saved.organization_id);
              clearErrors("organization_id");
            }
          }}
        />
      )}
    </FormDialog>
  );
}
