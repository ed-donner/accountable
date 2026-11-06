import { AccountingPage } from "../AccountingPage";

export function Journal() {
  return (
    <AccountingPage
      title="Journal"
      report="Every entry in the books, newest first, each linking to the invoice, payment or bill it came from."
    />
  );
}
