import { STATUS_LABELS, type Status } from './api'

const STYLE: Record<Status, { background: string; color: string }> = {
  lead: { background: 'var(--tint)', color: 'var(--midnight)' },
  qualified: { background: 'var(--marigold-tint)', color: 'var(--marigold-text)' },
  customer: { background: 'var(--sea-green-tint)', color: 'var(--sea-green-text)' },
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="pill" style={STYLE[status]}>
      {STATUS_LABELS[status]}
    </span>
  )
}
