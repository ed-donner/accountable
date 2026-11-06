import { Link } from "react-router";

import { ledgerPath } from "./links";
import { accountName } from "./queries";

/** An account's name as a link to its ledger (J18). */
export function AccountLink({ account }: { account: string }) {
  return (
    <Link to={ledgerPath(account)} className="link">
      {accountName(account)}
    </Link>
  );
}
