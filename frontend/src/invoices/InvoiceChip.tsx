import { Chip } from "../components/Chip";
import type { ShowsAs } from "./queries";
import { shownAs } from "./status";

/** What an invoice shows as, named in its chip, so its color never carries the meaning alone. */
export function InvoiceChip({ shows }: { shows: ShowsAs }) {
  const { label, tone } = shownAs(shows);
  return <Chip tone={tone}>{label}</Chip>;
}
