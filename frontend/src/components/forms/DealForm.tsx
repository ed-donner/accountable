import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useSaveDeal } from "@/api/deals";
import { useToday } from "@/api/meta";
import type { Deal } from "@/api/types";
import { Input, fieldClasses } from "@/components/ui/input";
import { addDaysTo } from "@/lib/dates";
import { isClosed, STAGES, STAGE_NAMES, USUAL_PROBABILITY, type Stage } from "@/lib/rules";
import { messages } from "@/lib/words";
import { cn } from "@/lib/utils";
import { ContactPicker } from "./ContactPicker";
import { Field, FormDialog, fieldAria, showSaveError } from "./FormDialog";
import { OrganizationPicker } from "./OrganizationPicker";
import { dealSchema, toWholeNumber, type DealValues } from "./schemas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The deal to edit, or none to add one. */
  deal?: Deal;
  /** Where a new deal starts, such as the column's stage on the board (PIPE-7). */
  defaultStage?: Stage;
  defaultOrganizationId?: number;
  onSaved?: (deal: Deal) => void;
};

const FIELDS = ["name", "organization_id", "main_contact_id", "stage", "value", "probability", "close_date"] as const;

function valuesOf(today: string, deal?: Deal, defaultStage: Stage = "new", defaultOrganizationId?: number): DealValues {
  if (deal) {
    return {
      name: deal.name,
      organization_id: deal.organization.id,
      main_contact_id: deal.main_contact?.id ?? null,
      stage: deal.stage,
      value: String(deal.value),
      probability: String(deal.probability),
      close_date: deal.close_date,
    };
  }
  return {
    name: "",
    organization_id: defaultOrganizationId ?? null,
    main_contact_id: null,
    stage: defaultStage,
    value: "",
    probability: String(USUAL_PROBABILITY[defaultStage]),
    // A new deal starts 30 days from today, or today if it's added at Won or Lost.
    // Until today arrives from the API, the form waits with no date.
    close_date: !today ? "" : isClosed(defaultStage) ? today : addDaysTo(today, 30),
  };
}

export function DealForm({ open, onOpenChange, deal, defaultStage, defaultOrganizationId, onSaved }: Props) {
  const today = useToday();
  const save = useSaveDeal();
  const form = useForm<DealValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: valuesOf(today ?? "", deal, defaultStage, defaultOrganizationId),
    mode: "onTouched",
  });
  const { register, handleSubmit, reset, setError, setValue, control, formState } = form;
  const errors = formState.errors;
  const stage = useWatch({ control, name: "stage" }) as Stage;
  const organizationId = useWatch({ control, name: "organization_id" });

  useEffect(() => {
    if (open && today) reset(valuesOf(today, deal, defaultStage, defaultOrganizationId));
  }, [open, today, deal, defaultStage, defaultOrganizationId, reset]);

  // Choosing a stage fills in its probability; Won or Lost also fills in today (STG-2).
  const stageField = register("stage", {
    onChange: (event) => {
      const next = event.target.value as Stage;
      setValue("probability", String(USUAL_PROBABILITY[next]), { shouldValidate: true });
      if (isClosed(next) && today) setValue("close_date", today, { shouldValidate: true });
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input = {
      name: values.name.trim(),
      organization_id: values.organization_id as number,
      main_contact_id: values.main_contact_id,
      stage: values.stage as Stage,
      value: toWholeNumber(values.value) ?? 0,
      probability: toWholeNumber(values.probability) ?? USUAL_PROBABILITY[values.stage as Stage],
      close_date: values.close_date,
    };
    save.mutate(
      { id: deal?.id, input },
      {
        onSuccess: (saved) => {
          toast.success(deal ? messages.saved : messages.added("Deal"));
          onOpenChange(false);
          onSaved?.(saved);
        },
        onError: (error) => showSaveError(error, setError, FIELDS),
      },
    );
  });

  const locked = isClosed(stage);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? `Edit ${deal.name}` : "Add deal"}
      submitLabel={deal ? "Save changes" : "Add deal"}
      pending={save.isPending || !today}
      onSubmit={onSubmit}
    >
      <Field id="deal-name" label="Name" required error={errors.name?.message}>
        <Input {...fieldAria("deal-name", errors.name?.message)} autoComplete="off" {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="deal-organization" label="Organization" required error={errors.organization_id?.message}>
          <Controller
            control={control}
            name="organization_id"
            render={({ field }) => (
              <OrganizationPicker
                id="deal-organization"
                value={field.value}
                onChange={(value) => {
                  // A new organization clears the main contact (spec 1.5).
                  if (value !== field.value) setValue("main_contact_id", null);
                  field.onChange(value);
                }}
                invalid={!!errors.organization_id}
                describedBy={errors.organization_id ? "deal-organization-error" : undefined}
              />
            )}
          />
        </Field>
        <Field id="deal-contact" label="Main contact" error={errors.main_contact_id?.message}>
          <Controller
            control={control}
            name="main_contact_id"
            render={({ field }) => (
              <ContactPicker
                id="deal-contact"
                organizationId={organizationId}
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.main_contact_id}
                describedBy={errors.main_contact_id ? "deal-contact-error" : undefined}
              />
            )}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="deal-stage" label="Stage" required error={errors.stage?.message}>
          <select {...fieldAria("deal-stage", errors.stage?.message)} className={cn(fieldClasses, "h-10")} {...stageField}>
            {STAGES.map((value) => (
              <option key={value} value={value}>
                {STAGE_NAMES[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="deal-value" label="Value" required error={errors.value?.message}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-ink-subtle">
              $
            </span>
            <Input
              {...fieldAria("deal-value", errors.value?.message)}
              inputMode="numeric"
              autoComplete="off"
              className="pl-7 font-mono text-[13px]"
              {...register("value")}
            />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="deal-probability"
          label="Probability"
          error={errors.probability?.message}
          hint={locked ? `${STAGE_NAMES[stage]} is always ${USUAL_PROBABILITY[stage]}%.` : undefined}
        >
          <div className="relative">
            <Input
              {...fieldAria("deal-probability", errors.probability?.message)}
              inputMode="numeric"
              autoComplete="off"
              readOnly={locked}
              aria-readonly={locked || undefined}
              className={cn("pr-8 font-mono text-[13px]", locked && "bg-page text-ink-muted")}
              {...register("probability")}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[13px] text-ink-subtle">
              %
            </span>
          </div>
        </Field>
        <Field id="deal-close" label={locked ? "Close date" : "Expected close date"} required error={errors.close_date?.message}>
          <Input {...fieldAria("deal-close", errors.close_date?.message)} type="date" {...register("close_date")} />
        </Field>
      </div>
    </FormDialog>
  );
}
