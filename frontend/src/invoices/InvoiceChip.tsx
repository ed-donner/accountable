import { Chip } from "../components/Chip";
import type { ShowsAs } from "./queries";
import { shownAs } from "./status";

/**
 * What an invoice shows as, named in its chip, so its color never carries the meaning alone.
 * On the page background, as beside its title, the quiet Draft chip takes the panel color.
 */
export function InvoiceChip({ shows, onPage }: { shows: ShowsAs; onPage?: boolean }) {
  const { label, tone } = shownAs(shows);
  return <Chip tone={onPage && tone === "quiet" ? "quietOnPage" : tone}>{label}</Chip>;
}
