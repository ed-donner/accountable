import { Link } from "react-router-dom";

/** A link to a record, or a quiet placeholder when there isn't one. */
export function RecordLink({ to, name, none }: { to: string; name: string | null | undefined; none: string }) {
  return name ? <Link to={to}>{name}</Link> : <span className="muted">{none}</span>;
}
