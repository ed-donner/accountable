import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format, parseISO } from "date-fns";
import { Download, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { FormProvider, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { useBlocker, useNavigate, useParams } from "react-router";

import { AccountingPanel } from "../../books/AccountingPanel";
import { useCompanySettings, useSavedLogo, type CompanySettings } from "../../company/settings";
import { totals } from "../../company/tax";
import { Chip } from "../../components/Chip";
import { ConfirmDelete } from "../../components/ConfirmDelete";
import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import { PageHeader } from "../../components/PageHeader";
import { AddedAndChanged, SidePanel, WhoAndWhen } from "../../components/RecordLayout";
import { ApiError, download } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { price } from "../../lib/money";
import { useNotify } from "../../lib/notify";
import { FORM_ERROR, showSaveError } from "../../lib/saveErrors";
import { useToday } from "../../lib/useToday";
import { recordId } from "../../lib/validate";
import { plural } from "../../lib/words";
import {
  DraftForm,
  draftSchema,
  issueProblems,
  savedIds,
  toDraftRequest,
  toDraftValues,
  typedLines,
  type DraftValues,
} from "../DraftForm";
import { InvoiceChip } from "../InvoiceChip";
import { DocumentDrawing } from "../../company/DocumentDrawing";
import { look, type DocumentValues, type Mark } from "../../company/layout";
import { PaymentForm } from "../PaymentForm";
import {
  useDeleteDraft,
  useDeletePayment,
  useInvoice,
  useIssue,
  useSaveDraft,
  useVoid,
  type InvoiceDetail,
  type Payment,
} from "../queries";
import { methodLabel } from "../status";

const MARKS: Partial<Record<InvoiceDetail["shows_as"], Mark>> = { paid: "paid", overdue: "overdue", void: "void" };

function issuedValues(invoice: InvoiceDetail, settings: CompanySettings): DocumentValues {
  return {
    kind: "invoice",
    ...look(settings),
    company: invoice.company,
    number: invoice.number,
    date: invoice.issue_date!,
    end_date: invoice.due_date!,
    recipient: invoice.bill_to,
    lines: invoice.lines,
    subtotal_cents: invoice.subtotal_cents,
    tax_cents: invoice.tax_cents,
    total_cents: invoice.total_cents,
    paid_cents: invoice.paid_cents,
    tax_label: invoice.tax_label,
    tax_rate: invoice.tax_rate,
    mark: MARKS[invoice.shows_as] ?? null,
  };
}

/** A draft as it's being typed, with the dates it would have if issued today (V19, V27). */
function draftValues(invoice: InvoiceDetail, settings: CompanySettings, values: DraftValues, today: string) {
  const lines = typedLines(values.lines).map((line) => ({ ...line, description: line.description.trim() || null }));
  return {
    kind: "invoice",
    ...look(settings),
    company: invoice.company,
    number: null,
    date: today,
    end_date: format(addDays(parseISO(today), settings.payment_terms_days), "yyyy-MM-dd"),
    recipient: values.bill_to.trim() || null,
    lines,
    ...totals(lines, invoice.tax_rate),
    paid_cents: 0,
    tax_label: invoice.tax_label,
    tax_rate: invoice.tax_rate,
    mark: "draft",
  } satisfies DocumentValues;
}

/** An invoice's page (V19): its address can't be an invoice, or names one that no longer exists, says so (N4). */
export function Invoice() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="invoice" to="/invoices" section="Invoices" />;
  return <InvoiceRecord id={id} />;
}

function InvoiceRecord({ id }: { id: number }) {
  const invoice = useInvoice(id);
  const settings = useCompanySettings();
  const logoUrl = useSavedLogo(settings.data);
  if (invoice.error instanceof ApiError && invoice.error.kind === "missing") {
    return <MissingRecord word="invoice" to="/invoices" section="Invoices" />;
  }
  if (!invoice.data || !settings.data) {
    const failed = invoice.error ?? settings.error;
    const retry = () => {
      void invoice.refetch();
      void settings.refetch();
    };
    return <LoadFailed onPage error={failed} onRetry={retry} />;
  }
  const shown: Shown = {
    invoice: invoice.data,
    settings: settings.data,
    logoUrl,
    refetch: () => void invoice.refetch(),
    // A later read that failed, said under the page's title, with what's on screen kept.
    notice: <LoadFailed onPage keeping error={invoice.error} onRetry={() => invoice.refetch()} />,
  };
  return invoice.data.status === "draft" ? <DraftPage {...shown} /> : <IssuedPage {...shown} />;
}

type Shown = {
  invoice: InvoiceDetail;
  settings: CompanySettings;
  logoUrl: string | null;
  refetch: () => void;
  notice: ReactNode;
};

function Columns({ side, preview }: { side: ReactNode; preview: ReactNode }) {
  return (
    <div className="grid grid-cols-[480px_minmax(0,1fr)] items-start gap-3 px-5 pb-4">
      <div className="flex min-w-0 flex-col gap-3">{side}</div>
      <div className="min-w-0">{preview}</div>
    </div>
  );
}

type AskProps = {
  title: string;
  body: string;
  yes: string;
  no?: string;
  danger?: boolean;
  onYes: () => void;
  onNo: () => void;
};

/** A question before something that can't be taken back, such as issuing or voiding. */
function Ask(props: AskProps) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && props.onNo()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center bg-veil p-6">
          <AlertDialog.Content className="w-full max-w-[460px] rounded-panel bg-raised p-6 shadow-(--shadow-dialog)">
            <AlertDialog.Title className="text-[20px] leading-7 font-semibold break-words">
              {props.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2">{props.body}</AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className="btn btn-secondary">{props.no ?? "Cancel"}</AlertDialog.Cancel>
              <AlertDialog.Action className={props.danger ? "btn btn-danger" : "btn btn-primary"} onClick={props.onYes}>
                {props.yes}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Asks before leaving a draft with changes not yet saved, by a link or the browser alike (V8).
 * A leave the page means, such as after Delete draft, sets leaving first.
 */
function LeaveGuard({ dirty, leaving }: { dirty: boolean; leaving: RefObject<boolean> }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (blocker.state !== "blocked") return null;
  return (
    <Ask
      title="Leave without saving?"
      body="Your changes to this draft will be lost."
      yes="Leave"
      no="Stay"
      onYes={() => blocker.proceed()}
      onNo={() => blocker.reset()}
    />
  );
}

/** Runs one at a time, however quickly it's asked for, since a button only disables once the page redraws. */
function useOnce() {
  const running = useRef(false);
  return async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    try {
      await work();
    } finally {
      running.current = false;
    }
  };
}

function useDraftForm(invoice: InvoiceDetail) {
  const form = useForm<DraftValues>({ resolver: zodResolver(draftSchema), defaultValues: toDraftValues(invoice) });
  const { reset, formState } = form;
  const filledFrom = useRef(invoice);
  // A newer read, such as a teammate's save, fills the form only if nothing has been typed since it was
  // filled, as in B10. Only a new reply does: refilling the same one would remount every line's boxes.
  useEffect(() => {
    if (invoice === filledFrom.current) return;
    filledFrom.current = invoice;
    if (!formState.isDirty) reset(toDraftValues(invoice));
  }, [invoice, formState, reset]);
  return form;
}

function DraftPage({ invoice, settings, logoUrl, refetch, notice }: Shown) {
  const form = useDraftForm(invoice);
  const save = useSaveDraft(invoice.id);
  const issue = useIssue(invoice.id);
  const remove = useDeleteDraft(invoice.id);
  const notify = useNotify();
  const navigate = useNavigate();
  const once = useOnce();
  const leaving = useRef(false);
  const [asking, setAsking] = useState<"issue" | "delete" | null>(null);
  const values = useWatch({ control: form.control }) as DraftValues;
  const today = useToday();
  const preview = useMemo(() => draftValues(invoice, settings, values, today), [invoice, settings, values, today]);

  function failed(error: unknown) {
    showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
    // A teammate may have issued it meanwhile, which a fresh read then shows (V12).
    if (error instanceof ApiError && error.kind === "server") refetch();
  }

  const saveDraft = () =>
    once(() =>
      form.handleSubmit(async (typed) => {
        const sent = JSON.stringify(form.getValues());
        try {
          const saved = await save.mutateAsync(toDraftRequest(typed));
          if (JSON.stringify(form.getValues()) === sent) form.reset(toDraftValues(saved));
          else {
            // What was typed while the save was on its way stays, still to be saved, but a new
            // line it saved takes its id, so the next save keeps its name and product (V6).
            for (const [place, id] of savedIds(typed, saved, form.getValues())) form.setValue(`lines.${place}.id`, id);
          }
          notify.success("Draft saved.");
        } catch (error) {
          failed(error);
        }
      })(),
    );

  const askToIssue = () =>
    form.handleSubmit((typed) => {
      const problems = issueProblems(typed, invoice, settings);
      if (Object.keys(problems).length === 0) return setAsking("issue");
      for (const [field, message] of Object.entries(problems)) {
        form.setError(field === FORM_ERROR ? `root.${FORM_ERROR}` : (field as "bill_to" | "lines"), { message });
      }
    })();

  const issueNow = () =>
    once(async () => {
      setAsking(null);
      try {
        await issue.mutateAsync(toDraftRequest(form.getValues()));
        notify.success("Invoice issued.");
      } catch (error) {
        failed(error);
      }
    });

  const deleteDraft = () =>
    once(async () => {
      try {
        leaving.current = true;
        await remove.mutateAsync();
        notify.success("Draft deleted.");
        void navigate("/invoices");
      } catch (error) {
        leaving.current = false;
        notify.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });

  const busy = save.isPending || issue.isPending;
  return (
    <FormProvider {...form}>
      <PageHeader title="Draft invoice">
        <InvoiceChip shows="draft" onPage />
        <div className="ml-auto flex flex-none gap-2">
          <button type="button" className="btn btn-secondary bg-panel" onClick={() => setAsking("delete")}>
            <Trash2 size={15} aria-hidden="true" />
            Delete draft
          </button>
          <button type="button" className="btn btn-secondary bg-panel" disabled={busy} onClick={() => void saveDraft()}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void askToIssue()}>
            Issue invoice
          </button>
        </div>
      </PageHeader>
      {notice}
      <form noValidate onSubmit={(event) => event.preventDefault()}>
        <Columns
          side={
            <>
              <FormError form={form} />
              <DraftForm invoice={invoice} />
              <div className="px-1">
                <AddedAndChanged record={invoice} />
              </div>
            </>
          }
          preview={<DocumentDrawing values={preview} logoUrl={logoUrl} />}
        />
      </form>
      <LeaveGuard dirty={form.formState.isDirty} leaving={leaving} />
      {asking === "issue" && (
        <Ask
          title="Issue this invoice?"
          body="Once it's issued, it can't be changed."
          yes="Issue invoice"
          onYes={() => void issueNow()}
          onNo={() => setAsking(null)}
        />
      )}
      {asking === "delete" && (
        <ConfirmDelete
          title="Delete this draft?"
          message="It has no number yet, so nothing is skipped. This can't be undone."
          confirmLabel="Delete draft"
          pending={remove.isPending}
          onConfirm={deleteDraft}
          onClose={() => setAsking(null)}
        />
      )}
    </FormProvider>
  );
}

/** A refusal about the draft as a whole, such as a deal with no organization, at the top of the form (V10). */
function FormError({ form }: { form: UseFormReturn<DraftValues> }) {
  const message = form.formState.errors.root?.[FORM_ERROR]?.message;
  if (!message) return null;
  return (
    <p role="alert" className="panel px-[18px] py-3 text-raspberry-text">
      {message}
    </p>
  );
}

function IssuedPage({ invoice, settings, logoUrl, notice }: Shown) {
  const [dialog, setDialog] = useState<"void" | "pay" | Payment | null>(null);
  const voiding = useVoid(invoice.id);
  const removing = useDeletePayment(invoice.id);
  const notify = useNotify();
  const once = useOnce();
  const preview = useMemo(() => issuedValues(invoice, settings), [invoice, settings]);
  const voidable = invoice.status === "issued" && invoice.payments.length === 0;

  const act = (work: () => Promise<unknown>, said: string) =>
    once(async () => {
      setDialog(null);
      try {
        await work();
        notify.success(said);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    });

  const downloadPdf = () =>
    once(() =>
      download(`/invoices/${invoice.id}/pdf`, `${invoice.number}.pdf`).catch((error: unknown) =>
        notify.error(error instanceof Error ? error.message : "Something went wrong."),
      ),
    );

  return (
    <>
      <PageHeader title={invoice.number!}>
        <InvoiceChip shows={invoice.shows_as} onPage />
        <div className="ml-auto flex flex-none gap-2">
          {voidable && (
            <button type="button" className="btn btn-secondary bg-panel" onClick={() => setDialog("void")}>
              Void
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void downloadPdf()}>
            <Download size={15} aria-hidden="true" />
            Download PDF
          </button>
        </div>
      </PageHeader>
      {notice}
      <Columns
        side={
          <>
            <Details invoice={invoice} />
            <Payments invoice={invoice} onRecord={() => setDialog("pay")} onDelete={setDialog} />
            <AccountingPanel kind="invoice" id={invoice.id} />
          </>
        }
        preview={<DocumentDrawing values={preview} logoUrl={logoUrl} />}
      />
      {dialog === "pay" && <PaymentForm invoice={invoice} onClose={() => setDialog(null)} />}
      {dialog === "void" && (
        <Ask
          title={`Void ${invoice.number}?`}
          body="It keeps its number and is marked VOID. This can't be undone."
          yes="Void"
          danger
          onYes={() => void act(() => voiding.mutateAsync(undefined), "Invoice voided.")}
          onNo={() => setDialog(null)}
        />
      )}
      {typeof dialog === "object" && dialog !== null && (
        <Ask
          title={`Delete this payment of ${price(dialog.amount_cents)}?`}
          body={`What's owed goes back up to ${price(invoice.owed_cents + dialog.amount_cents)}.`}
          yes="Delete payment"
          danger
          onYes={() => void act(() => removing.mutateAsync(dialog.id), "Payment deleted.")}
          onNo={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** How much is paid and what's still owed, paid in Sea Green and owed in the line color, or Raspberry once overdue. */
function PaidBar({ invoice }: { invoice: InvoiceDetail }) {
  const paid = invoice.total_cents > 0 ? (invoice.paid_cents / invoice.total_cents) * 100 : 0;
  const owedTone = invoice.shows_as === "overdue" ? "bg-raspberry" : "bg-line";
  return (
    <div
      role="img"
      aria-label={`${price(invoice.paid_cents)} paid and ${price(invoice.owed_cents)} owed`}
      className={`mt-3 h-2 overflow-hidden rounded-full ${owedTone}`}
    >
      <div className="h-full rounded-full bg-sea-green" style={{ width: `${paid}%` }} />
    </div>
  );
}

function Details({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <SidePanel title="Details">
      <div className="num text-[24px] leading-[30px] font-medium" data-testid="invoice-total">
        {price(invoice.total_cents)}
      </div>
      {invoice.status === "issued" && (
        <>
          <PaidBar invoice={invoice} />
          <div className="num mt-1.5 flex justify-between text-[13px]">
            <span>{price(invoice.paid_cents)} paid</span>
            <span>{price(invoice.owed_cents)} owed</span>
          </div>
        </>
      )}
      <dl className="mt-3 flex flex-col gap-1">
        <div className="flex justify-between gap-4">
          <dt className="text-[13px] font-semibold">Issued</dt>
          <dd className="num text-[13px]">{formatDate(invoice.issue_date!)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[13px] font-semibold">Due</dt>
          <dd className="flex items-center gap-2">
            {invoice.days_late !== null && (
              <>
                <Chip tone="alert">Overdue</Chip>
                <span className="text-[13px]">{plural(invoice.days_late, "day")} late</span>
              </>
            )}
            <span className="num text-[13px]">{formatDate(invoice.due_date!)}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-col gap-0.5 text-[13px] leading-[18px] text-muted">
        <WhoAndWhen action="Added" person={invoice.created_by} at={invoice.created_at} />
        <WhoAndWhen action="Issued" person={invoice.issued_by} at={invoice.issue_date!} />
        {invoice.voided_at && <WhoAndWhen action="Voided" person={invoice.voided_by} at={invoice.voided_at} />}
      </div>
    </SidePanel>
  );
}

function Payments(props: { invoice: InvoiceDetail; onRecord: () => void; onDelete: (payment: Payment) => void }) {
  const { invoice } = props;
  const canPay = invoice.status === "issued" && invoice.owed_cents > 0;
  // The payments whose entries are showing under their row (V33).
  const [opened, setOpened] = useState<number[]>([]);
  const toggle = (id: number) =>
    setOpened((now) => (now.includes(id) ? now.filter((other) => other !== id) : [...now, id]));
  return (
    <SidePanel
      title="Payments"
      action={
        canPay && (
          <button type="button" className="btn btn-secondary" onClick={props.onRecord}>
            Record payment
          </button>
        )
      }
    >
      {invoice.payments.length === 0 ? (
        <p className="py-1 text-muted">No payments yet.</p>
      ) : (
        <ul aria-label="Payments">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="py-1.5" data-testid="payment">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="num text-[13px]">{formatDate(payment.paid_on)}</span>
                    <span className="num text-[13px] font-medium">{price(payment.amount_cents)}</span>
                    <span>{methodLabel(payment.method)}</span>
                    {payment.reference && <span className="truncate">{payment.reference}</span>}
                  </div>
                  <div className="text-[13px] leading-[18px] text-muted">
                    <WhoAndWhen action="Recorded" person={payment.created_by} at={payment.created_at} />
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    aria-expanded={opened.includes(payment.id)}
                    aria-label={`Accounting for payment of ${price(payment.amount_cents)}`}
                    onClick={() => toggle(payment.id)}
                  >
                    Accounting
                  </button>
                  <button
                    type="button"
                    className="icon-btn flex-none"
                    aria-label={`Delete payment of ${price(payment.amount_cents)}`}
                    onClick={() => props.onDelete(payment)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {opened.includes(payment.id) && <AccountingPanel kind="payment" id={payment.id} heading={false} />}
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  );
}
