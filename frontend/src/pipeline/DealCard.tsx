import { forwardRef, type HTMLAttributes } from "react";
import type { DealRow } from "../deals/hooks";
import { formatDate, money } from "../shared/format";
import { LateBadge } from "../shared/LateBadge";
import { ProbabilityRing } from "../shared/ProbabilityRing";
import { stageInfo } from "../shared/stages";

type Props = HTMLAttributes<HTMLDivElement> & {
  deal: DealRow;
  className?: string;
};

/** P2: name, organization and main contact, value with the probability ring, close date and Late. */
export const DealCard = forwardRef<HTMLDivElement, Props>(function DealCard(
  { deal, className = "", ...rest },
  ref,
) {
  const info = stageInfo(deal.stage);
  return (
    <div ref={ref} className={`card ${className}`} data-deal-id={deal.id} {...rest}>
      <div className="t">{deal.name}</div>
      <div className="o">
        {[deal.organization_name ?? "No organization", deal.contact_name]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div className="r">
        <span className="v">{money(deal.value)}</span>
        {info.open && <ProbabilityRing value={deal.probability} color={info.color} />}
      </div>
      <div className="r close">
        <span>
          {deal.close_date
            ? `${info.open ? "Close" : "Closed"} ${formatDate(deal.close_date)}`
            : "No close date"}
        </span>
        <LateBadge late={deal.is_late} />
      </div>
    </div>
  );
});
