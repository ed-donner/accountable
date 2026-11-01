import { Link } from "react-router";

import { PageHeader } from "./PageHeader";

export function MissingRecord({ word, to, section }: { word: string; to: string; section: string }) {
  return (
    <>
      <PageHeader title={`This ${word} no longer exists`} />
      <div className="px-6">
        <Link to={to} className="link">
          Back to {section}
        </Link>
      </div>
    </>
  );
}
