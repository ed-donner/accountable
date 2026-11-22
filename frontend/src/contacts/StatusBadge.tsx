import { statusLabel, type Status } from "../shared/stages";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${status}`}>{statusLabel(status)}</span>;
}
