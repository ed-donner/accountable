import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect, useRef, type FormEvent, type HTMLAttributes } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { toast } from "sonner";

import { Field, messageId } from "../components/Field";
import { LoadFailed } from "../components/LoadFailed";
import { PageHeader } from "../components/PageHeader";
import { SidePanel, WhoAndWhen } from "../components/RecordLayout";
import { showSaveError } from "../lib/saveErrors";
import {
  settingsSchema,
  toForm,
  toRequest,
  useCompanySettings,
  useSaveSettings,
  type CompanySettings,
  type SettingsValues,
} from "./settings";

const PREFIX_HINT = "Up to 10 letters, digits and hyphens.";

/** The Company settings page (B2). It shows the form only once the settings are read, so blanks can't be saved over them (B11). */
export function SettingsPage() {
  const settings = useCompanySettings();
  const shown = settings.data;
  return (
    <>
      <PageHeader title="Company settings" />
      {shown?.updated_by && (
        <div className="-mt-1.5 px-6 pb-2 text-[13px] leading-[18px] text-muted">
          <WhoAndWhen action="Last changed" person={shown.updated_by} at={shown.updated_at} />
        </div>
      )}
      {shown ? (
        <>
          <LoadFailed onPage keeping error={settings.error} onRetry={() => settings.refetch()} />
          <SettingsForm settings={shown} />
        </>
      ) : (
        <LoadFailed onPage error={settings.error} onRetry={() => settings.refetch()} />
      )}
    </>
  );
}

function SettingsForm({ settings }: { settings: CompanySettings }) {
  const save = useSaveSettings();
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues: toForm(settings) });
  const { isDirty } = form.formState;
  const { reset } = form;
  // A save in the page takes a moment to disable the button, which a quick second press can beat.
  const saving = useRef(false);

  // A teammate's newer save fills the form only if nothing has been typed since it was filled (B10).
  useEffect(() => {
    if (!isDirty) reset(toForm(settings));
  }, [settings, isDirty, reset]);

  async function submit(values: SettingsValues) {
    try {
      const saved = await save.mutateAsync(toRequest(values));
      reset(toForm(saved));
      toast.success("Settings saved.");
    } catch (error) {
      showSaveError(error, form);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    try {
      await form.handleSubmit(submit)(event);
    } finally {
      saving.current = false;
    }
  }

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={onSubmit} className="px-5 pb-3">
        <div className="grid grid-cols-2 items-start gap-3">
          <SidePanel title="Company">
            <div className="flex flex-col gap-2.5">
              {settings.company_name === null && (
                <p className="flex items-center gap-2">
                  <Info size={16} aria-hidden="true" className="flex-none text-cerulean" />
                  No company name yet. Enter one below.
                </p>
              )}
              <Box field="company_name" label="Company name" />
              <AddressBox />
              <Box field="email" label="Email" />
              <Box field="phone" label="Phone" />
            </div>
          </SidePanel>
          <div className="flex min-w-0 flex-col gap-3">
            <SidePanel title="Tax">
              <div className="flex flex-col gap-2.5">
                <Box field="tax_label" label="Tax label" />
                <Box field="tax_rate" label="Tax rate" after="%" inputMode="decimal" />
              </div>
            </SidePanel>
            <SidePanel title="Quotes and invoices">
              <div className="flex flex-col gap-2.5">
                <Box field="payment_terms_days" label="Payment terms" after="days" inputMode="numeric" />
                <Box field="quote_prefix" label="Quote prefix" hint={PREFIX_HINT} />
                <Box field="invoice_prefix" label="Invoice prefix" hint={PREFIX_HINT} />
              </div>
            </SidePanel>
          </div>
        </div>
        <button type="submit" className="btn btn-primary mt-3" disabled={save.isPending}>
          Save settings
        </button>
      </form>
    </FormProvider>
  );
}

function boxId(field: keyof SettingsValues) {
  return `settings-${field.replaceAll("_", "-")}`;
}

type BoxProps = {
  field: keyof SettingsValues;
  label: string;
  hint?: string;
  /** What the number is in, shown after the box, such as days. */
  after?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
};

/** A one-line box. Enter in it saves the form. */
function Box({ field, label, hint, after, inputMode }: BoxProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<SettingsValues>();
  const id = boxId(field);
  const error = errors[field]?.message;
  const input = (
    <input
      id={id}
      // A number with its unit after it, kept short so the unit sits beside it.
      className={after ? "input w-32" : "input"}
      inputMode={inputMode}
      aria-invalid={!!error}
      aria-describedby={hint || error ? messageId(id) : undefined}
      {...register(field)}
    />
  );
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      {after ? (
        <div className="flex items-center gap-2">
          {input}
          <span className="flex-none text-muted">{after}</span>
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

/** Four lines tall, growing as more are typed. Enter starts a new line here. */
function AddressBox() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SettingsValues>();
  const id = boxId("address");
  return (
    <Field label="Address" htmlFor={id} error={errors.address?.message}>
      <textarea
        id={id}
        rows={4}
        className="input min-h-[98px] field-sizing-content"
        aria-invalid={!!errors.address}
        {...register("address")}
      />
    </Field>
  );
}
