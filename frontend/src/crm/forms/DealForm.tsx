import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "../../components/Field";
import { FormDialog } from "../../components/FormDialog";
import { RecordPicker, type PickerOption } from "../../components/RecordPicker";
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
type DealFormMethods = UseFormReturn<Input, unknown, Output>;

type Defaults = {
  defaultStage?: Stage;
  defaultOrganizationId?: number;
  defaultContactId?: number;
};

type Props = Defaults & {
  record?: Deal;
  onClose: () => void;
  onSaved?: (saved: Deal) => void;
};

type Lists = { meta: Meta; contacts: ContactRow[]; organizations: OrganizationRow[] };

/** The form's starting values need these, and it only reads them once. */
export function DealForm(props: Props) {
  const meta = useMeta();
  const contacts = useContacts();
  const organizations = useOrganizations();
  useCloseIfUnreadable([meta, contacts, organizations], props.onClose);

  if (!meta.data || !contacts.data || !organizations.data) return null;
  return <LoadedDealForm {...props} meta={meta.data} contacts={contacts.data} organizations={organizations.data} />;
}

function usualProbability(meta: Meta, stage: Stage) {
  return meta.stages.find((item) => item.key === stage)?.probability;
}

function recordValues(record: Deal): Input {
  return {
    name: record.name,
    organization_id: record.organization_id,
    main_contact_id: record.main_contact_id,
    stage: record.stage,
    value: String(record.value),
    probability: String(record.probability),
    close_date: record.close_date,
  };
}

/** A new deal's starting values. A contact's Add deal button brings their organization along. */
function newDealValues(
  { defaultStage, defaultOrganizationId, defaultContactId }: Defaults,
  contacts: ContactRow[],
  meta: Meta,
): Input {
  const stage = defaultStage ?? "new";
  return {
    name: "",
    organization_id:
      defaultOrganizationId ?? contacts.find((contact) => contact.id === defaultContactId)?.organization_id ?? null,
    main_contact_id: defaultContactId ?? null,
    stage,
    value: "",
    probability: String(usualProbability(meta, stage) ?? ""),
    close_date: isOpen(stage) ? "" : todayIso(),
  };
}

function LoadedDealForm({ record, onClose, onSaved, meta, contacts, organizations, ...defaults }: Props & Lists) {
  const save = useSaveDeal(record?.id);
  const start = record ? recordValues(record) : newDealValues(defaults, contacts, meta);
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(dealSchema(record)), defaultValues: start });
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = form;
  const changeStage = useStageChange({ form, record, meta, startStage: start.stage });

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
        <LinkPickers form={form} record={record} contacts={contacts} organizations={organizations} />
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
    </FormDialog>
  );
}

type StageChange = { form: DealFormMethods; record?: Deal; meta: Meta; startStage: Stage };

/** A new stage brings its usual probability, or the saved one on the way back to where the deal started. */
function useStageChange({ form, record, meta, startStage }: StageChange) {
  const { getValues, setValue, clearErrors } = form;
  const lastStage = useRef<Stage>(startStage);
  const lastOpenDate = useRef(record?.close_date ?? "");

  return function changeStage(stage: Stage) {
    const backToStart = record?.stage === stage;
    const probability = backToStart ? record.probability : usualProbability(meta, stage);
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
  };
}

function contactOption(contact: ContactRow): PickerOption {
  return { id: contact.id, name: contact.name, hint: contact.organization_name };
}

/** Contacts at the chosen organization, plus the chosen contact, who may be elsewhere. */
function useContactOptions(contacts: ContactRow[], organizationId: number | null, contactId: number | null) {
  const atOrganization = useMemo(() => {
    const narrowed =
      organizationId === null ? contacts : contacts.filter((contact) => contact.organization_id === organizationId);
    return narrowed.map(contactOption);
  }, [contacts, organizationId]);

  const chosen = contacts.find((contact) => contact.id === contactId);
  if (!chosen || atOrganization.some((option) => option.id === chosen.id)) return atOrganization;
  return [...atOrganization, contactOption(chosen)];
}

type Adding = { kind: "organization" | "contact"; name: string };

type LinkPickersProps = Omit<Lists, "meta"> & { form: DealFormMethods; record?: Deal };

/** The organization and main contact pickers, and the forms they open to add a new one. */
function LinkPickers({ form, record, contacts, organizations }: LinkPickersProps) {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = form;
  const [adding, setAdding] = useState<Adding | null>(null);
  const organizationId = useWatch({ control, name: "organization_id" });
  const contactId = useWatch({ control, name: "main_contact_id" });
  const contactOptions = useContactOptions(contacts, organizationId, contactId);

  function setOrganization(id: number) {
    setValue("organization_id", id);
    clearErrors("organization_id");
  }

  /** A contact chosen before any organization brings theirs along. */
  function setMainContact(id: number, theirOrganizationId: number | null | undefined) {
    setValue("main_contact_id", id);
    clearErrors("main_contact_id");
    if (organizationId === null && theirOrganizationId) setOrganization(theirOrganizationId);
  }

  function chooseContact(id: number) {
    setMainContact(id, contacts.find((contact) => contact.id === id)?.organization_id);
  }

  const organizationPlaceholder = record && record.organization_id === null ? "None" : "Choose an organization";
  const contactPlaceholder = record && record.main_contact_id === null ? "None" : "Choose a main contact";

  return (
    <>
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
          value={contactId}
          options={contactOptions}
          placeholder={contactPlaceholder}
          invalid={!!errors.main_contact_id}
          onChange={chooseContact}
          onAdd={(name) => setAdding({ kind: "contact", name })}
        />
      </Field>
      {adding?.kind === "organization" && (
        <OrganizationForm
          defaultName={adding.name}
          onClose={() => setAdding(null)}
          onSaved={(saved) => setOrganization(saved.id)}
        />
      )}
      {adding?.kind === "contact" && (
        <ContactForm
          defaultName={adding.name}
          defaultOrganizationId={organizationId}
          onClose={() => setAdding(null)}
          onSaved={(saved) => setMainContact(saved.id, saved.organization_id)}
        />
      )}
    </>
  );
}
