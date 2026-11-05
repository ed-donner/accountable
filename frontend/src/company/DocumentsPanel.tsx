import { useRef, type ChangeEvent } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Field, messageId } from "../components/Field";
import { SidePanel } from "../components/RecordLayout";
import { base64Of, imageSize } from "../lib/files";
import { accentProblem, isHexColor, keptAccent } from "./accent";
import type { DocumentPreview, SampleLook } from "./documentPreview";
import {
  DESIGNS,
  INVOICE_PREFIX_BLANK_MESSAGE,
  paymentTermsProblem,
  prefixProblem,
  taxRateProblem,
  useSavedLogo,
  type CompanySettings,
  type InvoiceDesign,
  type LogoChoice,
  type SettingsValues,
} from "./settings";

export const LOGO_TYPE_MESSAGE = "Choose a PNG or JPEG image";
export const LOGO_SIZE_MESSAGE = "Choose an image of 1 MB or less";
export const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_NAME = /\.(png|jpe?g)$/i;

/** 8.8750 as 8.875, as the backend writes a rate once it's saved (B7). */
function shownRate(typed: string) {
  const rate = typed.trim();
  return rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") || "0" : rate;
}

/**
 * The look on the page, unsaved changes included, with the saved value in place of any that
 * doesn't pass its check yet, and the logo the tile shows.
 */
function useSampleLook(settings: CompanySettings): { look: SampleLook; tileUrl: string | null } {
  const values = useWatch<SettingsValues>() as SettingsValues;
  const savedLogo = useSavedLogo(settings);
  const look: SampleLook = {
    design: values.invoice_design,
    accent: accentProblem(values.accent_color) ? settings.accent_color : keptAccent(values.accent_color),
    logo: shownLogo(values.logo, settings, savedLogo),
    company: { name: values.company_name, address: values.address, email: values.email, phone: values.phone },
    taxLabel: values.tax_label,
    taxRate: taxRateProblem(values.tax_rate) ? settings.tax_rate : shownRate(values.tax_rate),
    invoicePrefix: prefixProblem(values.invoice_prefix, INVOICE_PREFIX_BLANK_MESSAGE)
      ? settings.invoice_prefix
      : values.invoice_prefix.trim(),
    paymentTermsDays: paymentTermsProblem(values.payment_terms_days)
      ? settings.payment_terms_days
      : Number(values.payment_terms_days.trim()),
  };
  return { look, tileUrl: tileUrl(values.logo, settings, savedLogo) };
}

/** A new file shows as soon as it's chosen, even if the browser can't read its size for the sample. */
function tileUrl(choice: LogoChoice, settings: CompanySettings, savedUrl: string | null): string | null {
  if (choice.kind === "new") return choice.url;
  return choice.kind === "kept" && settings.logo ? savedUrl : null;
}

function shownLogo(choice: LogoChoice, settings: CompanySettings, savedUrl: string | null): SampleLook["logo"] {
  if (choice.kind === "new") return choice.size && { url: choice.url, ...choice.size };
  if (choice.kind === "removed" || !settings.logo || savedUrl === null) return null;
  return { url: savedUrl, width: settings.logo.width, height: settings.logo.height };
}

/** A small drawing of each design's page, in the accent color, so the choice can be seen before it's made. */
function DesignSketch({ design, accent }: { design: InvoiceDesign; accent: string }) {
  const lines = [44, 52, 60].map((y) => (
    <rect key={y} x={8} y={y} width={44} height={3} rx={1.5} className="fill-line" />
  ));
  return (
    <svg viewBox="0 0 60 78" className="h-[78px] w-[60px] rounded-[3px] bg-panel" aria-hidden="true">
      {design === "classic" && (
        <>
          <rect x={8} y={8} width={12} height={8} rx={2} className="fill-line" />
          <rect x={34} y={9} width={18} height={5} rx={1} fill={accent} />
          <rect x={8} y={22} width={20} height={3} rx={1.5} className="fill-line" />
        </>
      )}
      {design === "banner" && (
        <>
          <rect width={60} height={22} fill={accent} />
          <rect x={8} y={28} width={12} height={8} rx={2} className="fill-line" />
          <rect x={36} y={60} width={16} height={7} rx={1.5} fill={accent} />
        </>
      )}
      {design === "ledger" && (
        <>
          <rect x={8} y={8} width={30} height={6} rx={1} className="fill-ink" />
          <rect x={8} y={22} width={16} height={4} rx={1} fill={accent} />
          <rect x={6} y={41} width={48} height={9} rx={1.5} className="fill-page" />
        </>
      )}
      {lines}
    </svg>
  );
}

function DesignChoice({ accent }: { accent: string }) {
  const { register } = useFormContext<SettingsValues>();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-[13px] leading-[18px] font-semibold">Design</legend>
      <div className="flex gap-2">
        {DESIGNS.map(({ key, name }) => (
          <label
            key={key}
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-card bg-page px-3 pt-2.5 pb-2 has-[:checked]:ring-2 has-[:checked]:ring-sea-green has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input type="radio" value={key} className="sr-only" {...register("invoice_design")} />
            <DesignSketch design={key} accent={accent} />
            <span className="text-[13px] leading-[18px] font-semibold">{name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AccentColor() {
  const {
    register,
    setValue,
    formState: { errors, defaultValues },
  } = useFormContext<SettingsValues>();
  const typed = useWatch<SettingsValues, "accent_color">({ name: "accent_color" });
  // The picker needs a whole color, so it shows the saved one while the box holds something else.
  const picked = isHexColor(typed) ? typed : (defaultValues?.accent_color ?? "");
  const id = "settings-accent-color";
  const error = errors.accent_color?.message;
  return (
    <Field label="Accent color" htmlFor={id} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Pick the accent color"
          value={picked.trim().toLowerCase()}
          onChange={(event) =>
            setValue("accent_color", event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })
          }
          className="h-[34px] w-[34px] flex-none cursor-pointer appearance-none overflow-hidden rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <input
          id={id}
          className="input w-36"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? messageId(id) : undefined}
          {...register("accent_color")}
        />
      </div>
    </Field>
  );
}

function LogoChooser({ shownUrl }: { shownUrl: string | null }) {
  const {
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<SettingsValues>();
  const picker = useRef<HTMLInputElement>(null);
  const error = errors.logo?.message;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // The backend reads the file itself and has the last word, whatever its name says (B21).
    if (!LOGO_NAME.test(file.name)) return setError("logo", { type: "client", message: LOGO_TYPE_MESSAGE });
    if (file.size > MAX_LOGO_BYTES) return setError("logo", { type: "client", message: LOGO_SIZE_MESSAGE });
    clearErrors("logo");
    const base64 = await base64Of(file);
    const url = `data:${/\.png$/i.test(file.name) ? "image/png" : "image/jpeg"};base64,${base64}`;
    const size = await imageSize(url).catch(() => null);
    setValue("logo", { kind: "new", name: file.name, base64, url, size }, { shouldDirty: true });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] leading-[18px] font-semibold">Logo</span>
      <div className="flex items-center gap-3">
        {/* White in both modes, as the logo will be on paper. */}
        <div className="flex h-[60px] w-[150px] flex-none items-center justify-center rounded-control bg-white ring-1 ring-line">
          {shownUrl ? (
            <img src={shownUrl} alt="Logo" className="max-h-[48px] max-w-[134px] object-contain" />
          ) : (
            <span className="text-muted">No logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => picker.current?.click()}>
            Choose logo
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={shownUrl === null}
            onClick={() => {
              clearErrors("logo");
              setValue("logo", { kind: "removed" }, { shouldDirty: true });
            }}
          >
            Remove logo
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          aria-label="Logo file"
          onChange={(event) => void choose(event)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-raspberry-text">
          {error}
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted">PNG or JPEG, up to 1 MB.</p>
      )}
    </div>
  );
}

/**
 * How invoices look (B18 to B22): the design, the accent color and the logo, beside a sample
 * invoice drawn with them as they are on the page, before anything is saved.
 */
export function DocumentsPanel({ settings, Preview }: { settings: CompanySettings; Preview: DocumentPreview }) {
  const { look, tileUrl: shown } = useSampleLook(settings);
  return (
    <SidePanel title="Documents">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <DesignChoice accent={look.accent} />
          <AccentColor />
          <LogoChooser shownUrl={shown} />
        </div>
        <div className="min-w-0 rounded-card bg-page p-4" data-testid="sample-invoice">
          <Preview look={look} />
        </div>
      </div>
    </SidePanel>
  );
}
