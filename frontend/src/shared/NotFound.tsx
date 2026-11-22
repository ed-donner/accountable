import { Link } from "react-router-dom";
import { PageHeader } from "./PageHeader";

type Props = { what?: string; message?: string };

/** A bad link, or a record that's been deleted. */
export function NotFound({ what = "page", message }: Props) {
  return (
    <>
      <PageHeader title={`We couldn't find that ${what}`} />
      <div className="panel empty-state">
        <p>{message ?? `It may have been deleted, or the link may be wrong.`}</p>
        <Link to="/">Go to the dashboard</Link>
      </div>
    </>
  );
}
