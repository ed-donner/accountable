import { Chip } from "../components/Chip";
import { STATUS_NAMES, STATUS_TONES, type ShownStatus } from "./status";

/** A quote's status. On the page background, as beside its number, the quiet Draft chip takes the panel color. */
export function QuoteStatusChip({ status, onPage }: { status: ShownStatus; onPage?: boolean }) {
  const tone = onPage && STATUS_TONES[status] === "quiet" ? "quietOnPage" : STATUS_TONES[status];
  return <Chip tone={tone}>{STATUS_NAMES[status]}</Chip>;
}
