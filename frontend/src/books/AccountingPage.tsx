import { Info } from "lucide-react";

import { PageHeader } from "../components/PageHeader";

/** An Accounting page, for now a placeholder that says its report is coming and what it will show (J16). Reads nothing. */
export function AccountingPage({ title, report }: { title: string; report: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="px-6 pb-6">
        <section aria-label="Report status" className="panel flex w-[560px] max-w-full gap-3 px-[18px] py-4">
          <Info size={18} aria-hidden="true" className="mt-0.5 flex-none text-cerulean" />
          <div>
            <p className="font-semibold">This report is coming soon.</p>
            <p className="mt-1 text-muted">{report}</p>
          </div>
        </section>
      </div>
    </>
  );
}
