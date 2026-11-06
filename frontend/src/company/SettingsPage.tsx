import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect, useRef, type FormEvent, type HTMLAttributes, type ReactNode } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";

import { Field, messageId } from "../components/Field";
import { LoadFailed } from "../components/LoadFailed";
import { PageHeader } from "../components/PageHeader";
import { SidePanel, WhoAndWhen } from "../components/RecordLayout";
import { useNotify } from "../lib/notify";
import { showSaveError } from "../lib/saveErrors";
import { useToday } from "../lib/useToday";
import type { DocumentPreview } from "./documentPreview";
import { DocumentsPanel } from "./DocumentsPanel";
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

/**
 * The Company settings page (B2). It shows the form only once the settings are read, so blanks
 * can't be saved over them (B11). The sample invoice is drawn by what App.tsx hands it (B19).
 */
export function SettingsPage({ preview }: { preview: DocumentPreview }) {
  const settings = useCompanySettings();
  const shown = settings.data;
  if (!shown) {
    return (
      <>
        <PageHeader title="Company settings" />
        <LoadFailed onPage error={settings.error} onRetry={() => settings.refetch()} />
      </>
    );
  }
  return (
    <SettingsForm settings={shown} preview={preview}>
      <LoadFailed onPage keeping error={settings.error} onRetry={() => settings.refetch()} />
    </SettingsForm>
  );
}

type FormProps = { settings: CompanySettings; preview: DocumentPreview; children: ReactNode };

/** The header is inside the form, so Save settings is the form's own button and Enter in a box saves. */
function SettingsForm({ settings, preview, children }: FormProps) {
  const save = useSaveSettings();
  const notify = useNotify();
  const today = useToday();
  const form = useForm<SettingsValues>({
    // With the date as saved, which stays fine though it's after today, as the backend keeps it (B24).
    resolver: zodResolver(settingsSchema(today, settings.opening_balance_on)),
    defaultValues: toForm(settings),
  });
  const { isDirty } = form.formState;
  const { reset } = form;
  // A save in the page takes a moment to disable the button, which a quick second press can beat.
  const saving = useRef(false);
  const filledFrom = useRef(settings);

  // A teammate's newer save fills the form only if nothing has been typed since it was filled (B10).
  // Only settings that have just arrived do: just after a save, these are still the ones from before
  // it for a moment, and the form, filled from the save's reply, mustn't go back to them.
  useEffect(() => {
    if (settings === filledFrom.current) return;
    filledFrom.current = settings;
    if (!isDirty) reset(toForm(settings));
  }, [settings, isDirty, reset]);

  async function submit(values: SettingsValues) {
    // The boxes as they're sent, to tell what's typed while the save is on its way.
    const sent = form.getValues();
    try {
      const saved = await save.mutateAsync(toRequest(values));
      const typed = form.getValues();
      reset(toForm(saved));
      // What was typed meanwhile stays, still to be saved, so a teammate's save can't replace it either (B8, B10).
      for (const field of Object.keys(typed) as (keyof SettingsValues)[]) {
        if (typed[field] !== sent[field]) form.setValue(field, typed[field], { shouldDirty: true });
      }
      notify.success("Settings saved.");
    } catch (error) {
      showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
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
      <form noValidate onSubmit={onSubmit}>
        <PageHeader title="Company settings">
          {/* At the top, so it's in view while the page is at its top, though the form scrolls below it. */}
          <button type="submit" className="btn btn-primary ml-auto" disabled={save.isPending}>
            Save settings
          </button>
        </PageHeader>
        {settings.updated_by && (
          <div className="-mt-1.5 px-6 pb-2 text-[13px] leading-[18px] text-muted">
            <WhoAndWhen action="Last changed" person={settings.updated_by} at={settings.updated_at} />
          </div>
        )}
        {children}
        <div className="flex flex-col gap-3 px-5 pb-4">
          <div className="grid grid-cols-2 items-start gap-3">
            <div className="flex min-w-0 flex-col gap-3">
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
              <CashPanel />
            </div>
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
          <DocumentsPanel settings={settings} Preview={preview} />
        </div>
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

const OPENING_BALANCE_HINT_ID = "settings-opening-balance-hint";

/**
 * The opening balance the dashboard's cash flow counts from, and the day it's as of (B23). The
 * amount shows $ at its start and its figures in JetBrains Mono, as a bill's amount does.
 */
function CashPanel() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SettingsValues>();
  const amountId = boxId("opening_balance_cents");
  const dateId = boxId("opening_balance_on");
  const amountError = errors.opening_balance_cents?.message;
  const dateError = errors.opening_balance_on?.message;
  const describedBy = (id: string, error: string | undefined) =>
    [error ? messageId(id) : null, OPENING_BALANCE_HINT_ID].filter(Boolean).join(" ");
  return (
    <SidePanel title="Cash">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening balance" htmlFor={amountId} error={amountError}>
            <div className="relative">
              <span aria-hidden="true" className="num pointer-events-none absolute top-[9px] left-3 text-muted">
                $
              </span>
              <input
                id={amountId}
                inputMode="decimal"
                className="input num pl-7"
                aria-invalid={!!amountError}
                aria-describedby={describedBy(amountId, amountError)}
                {...register("opening_balance_cents")}
              />
            </div>
          </Field>
          <Field label="As of" htmlFor={dateId} error={dateError}>
            <input
              id={dateId}
              type="date"
              className="input num"
              aria-invalid={!!dateError}
              aria-describedby={describedBy(dateId, dateError)}
              {...register("opening_balance_on")}
            />
          </Field>
        </div>
        <p id={OPENING_BALANCE_HINT_ID} className="text-[13px] leading-[18px] text-muted">
          The cash in the bank at the start of that day. The dashboard's cash flow counts from it. Put a minus sign in
          front if the account was overdrawn.
        </p>
      </div>
    </SidePanel>
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
