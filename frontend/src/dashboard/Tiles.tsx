import { Link } from "react-router-dom";
import { Check, DollarSign, Phone, SquareKanban } from "lucide-react";
import type { ReactNode } from "react";
import { money, monthLabel, plural } from "../shared/format";
import type { Dashboard } from "./hooks";

function Tile({
  to,
  label,
  icon,
  value,
  note,
  alert,
  anchor,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  value: string;
  note: string;
  alert?: boolean;
  anchor?: boolean;
}) {
  const body = (
    <>
      <div className="tile-label">
        <span className="tile-icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <div className="tile-value">{value}</div>
      <div className="muted">{note}</div>
    </>
  );
  const className = `tile${alert ? " alert" : ""}`;
  return anchor ? (
    <a className={className} href={to} aria-label={`${label}: ${value}`}>
      {body}
    </a>
  ) : (
    <Link className={className} to={to} aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  );
}

/** "down 23% on October", comparing this month's wins with last month's. */
function comparedWithLastMonth(months: Dashboard["months"]): string | null {
  const [last, now] = months.slice(-2);
  if (!last || !now || last.won_value === 0) return null;
  const change = Math.round(((now.won_value - last.won_value) / last.won_value) * 100);
  if (change === 0) return `level with ${monthLabel(last.month)}`;
  return `${change > 0 ? "up" : "down"} ${Math.abs(change)}% on ${monthLabel(last.month)}`;
}

/** H1: the four headline figures, each one click from the answer behind it. */
export function Tiles({ data }: { data: Dashboard }) {
  const h = data.headline;
  const dueToday = h.follow_ups_due - h.follow_ups_overdue;
  const comparison = comparedWithLastMonth(data.months);
  return (
    <section className="tiles" aria-label="Headline figures">
      <Tile
        to="/pipeline"
        label="Open pipeline"
        icon={<SquareKanban size={16} />}
        value={money(h.open_value)}
        note={plural(h.open_count, "open deal")}
      />
      <Tile
        to="/pipeline"
        label="Expected revenue"
        icon={<DollarSign size={16} />}
        value={money(h.expected_revenue)}
        note="Value times probability"
      />
      <Tile
        to="/deals?stage=won"
        label="Won this month"
        icon={<Check size={16} />}
        value={money(h.won_this_month_value)}
        note={[plural(h.won_this_month_count, "deal"), comparison].filter(Boolean).join(", ")}
      />
      <Tile
        to="#follow-ups"
        anchor
        alert={h.follow_ups_due > 0}
        label="Follow-ups due"
        icon={<Phone size={16} />}
        value={String(h.follow_ups_due)}
        note={
          h.follow_ups_due
            ? `${h.follow_ups_overdue} overdue, ${dueToday} due today`
            : "Nothing due today"
        }
      />
    </section>
  );
}
