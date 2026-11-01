import { money } from "../../lib/money";
import type { Dashboard } from "../queries";

/** The figures behind both monthly charts, for anyone who can't see them. */
export function MonthsTable({ months, caption }: { months: Dashboard["months"]; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Revenue won</th>
          <th scope="col">Deals won</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month) => (
          <tr key={month.month}>
            <th scope="row">{month.label}</th>
            <td>{money(month.revenue)}</td>
            <td>{month.deals}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
