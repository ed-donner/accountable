/** D7: shown for open deals past their close date. The backend decides `late`. */
export function LateBadge({ late }: { late: boolean }) {
  if (!late) return null;
  return <span className="badge late">Late</span>;
}
