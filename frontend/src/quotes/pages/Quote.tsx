import { addDays, format, parseISO } from "date-fns";
import { Copy, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import { AddedAndChanged, Detail, SidePanel } from "../../components/RecordLayout";
import { isOpen } from "../../crm/deals";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/dates";
import { useNotify } from "../../lib/notify";
import { showSaveError } from "../../lib/saveErrors";
import { useToday } from "../../lib/useToday";
import { recordId } from "../../lib/validate";
import { AcceptDialog, DeclineDialog, SendDialog } from "../dialogs";
import {
  downloadQuote,
  useAcceptQuote,
  useCopyQuote,
  useDeclineQuote,
  useNewQuote,
  useQuote,
  useQuotes,
  useSaveQuote,
  useSendQuote,
  type DealLink,
  type NewQuote,
  type QuoteDetail,
} from "../queries";
import { LivePreview, QuoteForm, toForm, toRequest, useQuoteForm, type Carried } from "../QuoteForm";
import { QuoteDocument } from "../QuoteDocument";
import { acceptedMessage, shownStatus } from "../status";
import { QuoteStatusChip } from "../StatusChip";

const FORM_ID = "quote-form";
const VALID_FOR_DAYS = 30;
const SECONDARY = "btn btn-secondary bg-panel";

/** A quote's page, at /quotes/7 (Q28). */
export function Quote() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="quote" to="/quotes" section="Quotes" />;
  return <QuoteRecord key={id} id={id} />;
}

/** A new draft's page, at /quotes/new?deal=12. Nothing is saved, and no number taken, until Save quote (Q9). */
export function NewDraft() {
  const [params] = useSearchParams();
  const dealId = recordId(params.get("deal") ?? undefined);
  if (dealId === null) return <MissingRecord word="deal" to="/quotes" section="Quotes" />;
  return <NewDraftOn key={dealId} dealId={dealId} />;
}

function QuoteRecord({ id }: { id: number }) {
  const quote = useQuote(id);
  // Whether the draft's form holds changes not yet saved, which a teammate sending the quote mustn't throw away (Q21).
  const [unsaved, setUnsaved] = useState(false);
  if (quote.error instanceof ApiError && quote.error.kind === "missing") {
    return <MissingRecord word="quote" to="/quotes" section="Quotes" />;
  }
  if (!quote.data) return <LoadFailed onPage error={quote.error} onRetry={() => quote.refetch()} />;
  const page =
    quote.data.status === "draft" || unsaved ? (
      <DraftQuote quote={quote.data} onUnsaved={setUnsaved} />
    ) : (
      <FixedQuote quote={quote.data} />
    );
  return (
    <>
      <LoadFailed onPage keeping error={quote.error} onRetry={() => quote.refetch()} />
      {page}
    </>
  );
}

function NewDraftOn({ dealId }: { dealId: number }) {
  const start = useNewQuote(dealId);
  if (start.error instanceof ApiError && start.error.kind === "missing") {
    return <MissingRecord word="deal" to="/quotes" section="Quotes" />;
  }
  if (!start.data) return <LoadFailed onPage error={start.error} onRetry={() => start.refetch()} />;
  if (!isOpen(start.data.deal.stage)) return <ClosedDeal deal={start.data.deal} />;
  return <NewDraftForm start={start.data} />;
}

function ClosedDeal({ deal }: { deal: DealLink }) {
  return (
    <>
      <title>New quote | Accountable</title>
      <div className="px-6 pt-3 pb-2.5">
        <h1>This deal is closed, so it can&apos;t take a new quote.</h1>
      </div>
      <div className="px-6">
        <Link to={`/deals/${deal.id}`} className="link">
          Back to {deal.name}
        </Link>
      </div>
    </>
  );
}

type HeaderProps = { title: string; number?: boolean; chip?: ReactNode; deal: DealLink; children?: ReactNode };

/** The quote's number in JetBrains Mono, or "New quote", its chip, its deal under it, and its buttons. */
function QuoteHeader({ title, number, chip, deal, children }: HeaderProps) {
  return (
    <div className="flex flex-none items-start gap-[18px] px-6 pt-3 pb-2.5">
      <title>{`${title} | Accountable`}</title>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className={`min-w-0 truncate ${number ? "num font-medium" : ""}`}>{title}</h1>
          {chip}
        </div>
        <Link to={`/deals/${deal.id}`} className="link text-[13px] leading-[18px] text-muted">
          {deal.name}
        </Link>
      </div>
      <div className="ml-auto flex flex-none flex-wrap justify-end gap-2 pt-0.5">{children}</div>
    </div>
  );
}

/**
 * The details panel and the form at 480px, and the preview beside them, staying in view as the form
 * scrolls and scrolling by itself. Its scrollbar is in the paper's colors, because dark mode's would
 * be a dark bar beside the white sheet.
 */
function QuoteColumns({ side, preview }: { side: ReactNode; preview: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,480px)_minmax(0,1fr)] items-start gap-3 px-5 pb-4">
      <div className="flex min-w-0 flex-col gap-3">{side}</div>
      <div
        data-testid="preview-scroll"
        className="sticky top-3 max-h-[calc(100vh-24px)] min-w-0 overflow-y-auto rounded-panel bg-paper [scrollbar-color:var(--color-paper-muted)_var(--color-paper)]"
      >
        {preview}
      </div>
    </div>
  );
}

function DateDetail({ label, day }: { label: string; day: string }) {
  return (
    <Detail label={label}>
      <span className="num text-[13px]">{formatDate(day)}</span>
    </Detail>
  );
}

/** Date, Valid until on any quote but a draft, whose form has it, then Sent, Accepted or Declined (Q28). */
function DetailsPanel({ quote }: { quote: QuoteDetail }) {
  return (
    <SidePanel title="Details">
      <dl>
        <DateDetail label="Date" day={quote.quote_date} />
        {quote.status !== "draft" && <DateDetail label="Valid until" day={quote.valid_until} />}
        {quote.sent_on && <DateDetail label="Sent" day={quote.sent_on} />}
        {quote.decided_on && (
          <DateDetail label={quote.status === "accepted" ? "Accepted" : "Declined"} day={quote.decided_on} />
        )}
      </dl>
      <AddedAndChanged record={quote} />
    </SidePanel>
  );
}

/**
 * Saves the form if its checks pass, once however quickly it's asked (F10). Errors go beside their
 * boxes, and anything typed while the save was on its way stays (Q19).
 */
function useSaveForm(
  { form, takeSaved }: ReturnType<typeof useQuoteForm>,
  target: { dealId: number } | { id: number },
) {
  const save = useSaveQuote(target);
  const notify = useNotify();
  const saving = useRef(false);

  /** The saved quote and anything typed while the save was on its way, or null if it wasn't saved. */
  async function saveForm(): Promise<{ saved: QuoteDetail; typed: Carried | null } | null> {
    if (!(await form.trigger(undefined, { shouldFocus: true }))) return null;
    // A copy, because getValues() shares the lines with the form, which go on changing as they're typed in.
    const sent = structuredClone(form.getValues());
    try {
      const saved = await save.mutateAsync(toRequest(sent));
      return { saved, typed: takeSaved(sent, saved) };
    } catch (error) {
      showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
      return null;
    }
  }

  /** Save quote, by its button or Enter in a one-line box. */
  async function submit(
    event: FormEvent<HTMLFormElement>,
    onSaved?: (saved: QuoteDetail, typed: Carried | null) => void,
  ) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    try {
      const result = await saveForm();
      if (result) {
        notify.success("Quote saved.");
        onSaved?.(result.saved, result.typed);
      }
    } finally {
      saving.current = false;
    }
  }

  return { saveForm, submit, pending: save.isPending };
}

function NewDraftForm({ start }: { start: NewQuote }) {
  const today = useToday();
  const navigate = useNavigate();
  const empty = useMemo(
    () => ({ valid_until: format(addDays(parseISO(today), VALID_FOR_DAYS), "yyyy-MM-dd"), lines: [] }),
    [today],
  );
  const quoteForm = useQuoteForm(empty, today);
  const { form } = quoteForm;
  const { submit, pending } = useSaveForm(quoteForm, { dealId: start.deal.id });

  return (
    <>
      <QuoteHeader title="New quote" deal={start.deal}>
        <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={pending}>
          Save quote
        </button>
      </QuoteHeader>
      <QuoteColumns
        side={
          <>
            <SidePanel title="Details">
              <dl>
                <DateDetail label="Date" day={today} />
              </dl>
            </SidePanel>
            <QuoteForm
              form={form}
              id={FORM_ID}
              onSubmit={(event) =>
                // The saved draft's page takes on anything typed while the save was on its way (Q19).
                submit(event, (saved, typed) => navigate(`/quotes/${saved.id}`, { replace: true, state: typed }))
              }
            />
          </>
        }
        preview={
          <LivePreview
            control={form.control}
            number={null}
            quoteDate={today}
            company={start.company}
            preparedFor={start.prepared_for}
            taxLabel={start.tax_label}
            taxRate={start.tax_rate}
          />
        }
      />
    </>
  );
}

type Dialog = "send" | "accept" | "decline" | null;

type CommonProps = {
  quote: QuoteDetail;
  /** Saves a changed draft before the download. Resolves false if it couldn't. */
  saveFirst: () => Promise<boolean>;
};

/** Copy to new draft and Download PDF, which every quote has, Copy only while its deal is open (Q25, Q30). */
function CommonButtons({ quote, saveFirst }: CommonProps) {
  const copy = useCopyQuote();
  const notify = useNotify();
  const navigate = useNavigate();

  async function copyQuote() {
    try {
      const made = await copy.mutateAsync(quote.id);
      navigate(`/quotes/${made.id}`);
      notify.success(`Copied to ${made.number}.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function downloadPdf() {
    if (!(await saveFirst())) return;
    try {
      await downloadQuote(quote);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <>
      {isOpen(quote.deal.stage) && (
        <button type="button" className={SECONDARY} disabled={copy.isPending} onClick={copyQuote}>
          <Copy size={15} aria-hidden="true" />
          Copy to new draft
        </button>
      )}
      <button type="button" className={SECONDARY} onClick={downloadPdf}>
        <Download size={15} aria-hidden="true" />
        Download PDF
      </button>
    </>
  );
}

type DraftHeaderProps = {
  quote: QuoteDetail;
  pending: boolean;
  saveFirst: () => Promise<boolean>;
  onAsk: (dialog: Dialog) => void;
};

function DraftHeader({ quote, pending, saveFirst, onAsk }: DraftHeaderProps) {
  return (
    <QuoteHeader title={quote.number} number chip={<QuoteStatusChip status="draft" onPage />} deal={quote.deal}>
      <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={pending}>
        Save quote
      </button>
      <button type="button" className={SECONDARY} onClick={() => onAsk("send")}>
        Mark as sent
      </button>
      <button type="button" className={SECONDARY} onClick={() => onAsk("decline")}>
        Decline
      </button>
      <CommonButtons quote={quote} saveFirst={saveFirst} />
    </QuoteHeader>
  );
}

/**
 * The header and a notice for a draft that a teammate sent, accepted or declined while something
 * typed here was still unsaved. What was typed stays on screen, with nothing to save it (Q21).
 */
function ChangedMeanwhile({ quote, onLetGo }: { quote: QuoteDetail; onLetGo: () => void }) {
  const today = useToday();
  return (
    <>
      <QuoteHeader
        title={quote.number}
        number
        chip={<QuoteStatusChip status={shownStatus(quote, today)} onPage />}
        deal={quote.deal}
      />
      <div role="alert" className="panel mx-5 mb-2.5 flex flex-none items-center justify-between gap-3 py-2 pr-2 pl-4">
        <p>
          {quote.number} has been {quote.status}, so it can&apos;t be changed. Copy it to make a new draft.
        </p>
        <button type="button" className="btn btn-secondary flex-none" onClick={onLetGo}>
          Show the {quote.status} quote
        </button>
      </div>
    </>
  );
}

/** What a new draft's first save handed to this page in the address's state, if it opened it. */
function carriedFrom(state: unknown): Carried | null {
  return state !== null && typeof state === "object" && "values" in state ? (state as Carried) : null;
}

async function saveNothing(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

type DraftProps = {
  quote: QuoteDetail;
  /** Says whether the form holds changes not yet saved. */
  onUnsaved: (unsaved: boolean) => void;
};

/**
 * A draft, its form beside its live preview. If the quote stops being a draft while something
 * typed here is unsaved, such as when a teammate sends it, the form stays until it's let go (Q21).
 */
function DraftQuote({ quote, onUnsaved }: DraftProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const carried = carriedFrom(location.state);
  const quoteForm = useQuoteForm(quote, quote.quote_date, carried);
  const { form } = quoteForm;
  const { isDirty } = form.formState;
  const { saveForm, submit, pending } = useSaveForm(quoteForm, { id: quote.id });
  const send = useSendQuote();
  const decline = useDeclineQuote();
  const notify = useNotify();
  const [dialog, setDialog] = useState<Dialog>(null);
  const fixed = quote.status !== "draft";

  useEffect(() => onUnsaved(isDirty), [isDirty, onUnsaved]);

  // Taken once, so coming back to this address later doesn't bring back what has since been saved.
  useEffect(() => {
    if (carried) navigate(location.pathname, { replace: true, state: null });
  }, [carried, location.pathname, navigate]);

  /** Mark as sent and Download PDF save a changed draft first, so what's sent is what's on screen. */
  async function saveIfChanged() {
    return !form.formState.isDirty || (await saveForm()) !== null;
  }

  async function markAsSent() {
    if (await saveIfChanged()) {
      try {
        await send.mutateAsync(quote.id);
        notify.success("Quote sent.");
      } catch (error) {
        showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
      }
    }
    setDialog(null);
  }

  async function declineQuote() {
    try {
      await decline.mutateAsync(quote.id);
      notify.success("Quote declined.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    }
    setDialog(null);
  }

  return (
    <>
      {fixed ? (
        <ChangedMeanwhile quote={quote} onLetGo={() => form.reset(toForm(quote))} />
      ) : (
        <DraftHeader quote={quote} pending={pending} saveFirst={saveIfChanged} onAsk={setDialog} />
      )}
      <QuoteColumns
        side={
          <>
            <DetailsPanel quote={quote} />
            <QuoteForm form={form} id={FORM_ID} onSubmit={fixed ? saveNothing : (event) => submit(event)} />
          </>
        }
        preview={
          <LivePreview
            control={form.control}
            number={quote.number}
            quoteDate={quote.quote_date}
            company={quote.company}
            preparedFor={quote.prepared_for}
            taxLabel={quote.tax_label}
            taxRate={quote.tax_rate}
          />
        }
      />
      {!fixed && dialog === "send" && (
        <SendDialog
          number={quote.number}
          pending={pending || send.isPending}
          onConfirm={markAsSent}
          onClose={() => setDialog(null)}
        />
      )}
      {!fixed && dialog === "decline" && (
        <DeclineDialog
          number={quote.number}
          pending={decline.isPending}
          onConfirm={declineQuote}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** A sent, accepted or declined quote: the quote with no form, because only a draft can be changed (Q21). */
function FixedQuote({ quote }: { quote: QuoteDetail }) {
  const today = useToday();
  const status = shownStatus(quote, today);
  const accept = useAcceptQuote();
  const decline = useDeclineQuote();
  const dealQuotes = useQuotes({ deal_id: quote.deal.id });
  const notify = useNotify();
  const [dialog, setDialog] = useState<Dialog>(null);
  const waiting = quote.status === "sent";
  // Unknown until read, so Accept's dialog never leaves out a quote it would decline (Q22, N6).
  const declining =
    dealQuotes.data?.filter((other) => other.status === "sent" && other.id !== quote.id).map((other) => other.number) ??
    null;

  async function act(run: () => Promise<string>) {
    try {
      notify.success(await run());
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong.");
    }
    setDialog(null);
  }

  return (
    <>
      <QuoteHeader title={quote.number} number chip={<QuoteStatusChip status={status} onPage />} deal={quote.deal}>
        {waiting && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => setDialog("accept")}>
              Accept
            </button>
            <button type="button" className={SECONDARY} onClick={() => setDialog("decline")}>
              Decline
            </button>
          </>
        )}
        <CommonButtons quote={quote} saveFirst={async () => true} />
      </QuoteHeader>
      <QuoteColumns
        side={<DetailsPanel quote={quote} />}
        preview={
          <QuoteDocument
            number={quote.number}
            draft={false}
            quoteDate={quote.quote_date}
            validUntil={quote.valid_until}
            company={quote.company}
            preparedFor={quote.prepared_for}
            taxLabel={quote.tax_label}
            taxRate={quote.tax_rate}
            lines={quote.lines.map((line) => ({ ...line, key: line.id }))}
            figures={quote}
          />
        }
      />
      {dialog === "accept" && (
        <AcceptDialog
          number={quote.number}
          deal={quote.deal.name}
          subtotalCents={quote.subtotal_cents}
          declining={declining}
          readFailed={dealQuotes.isError}
          onRetry={() => dealQuotes.refetch()}
          pending={accept.isPending}
          onConfirm={() => act(async () => acceptedMessage(await accept.mutateAsync(quote.id)))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "decline" && (
        <DeclineDialog
          number={quote.number}
          pending={decline.isPending}
          onConfirm={() =>
            act(async () => {
              await decline.mutateAsync(quote.id);
              return "Quote declined.";
            })
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
