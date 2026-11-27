import type { StageName } from '../features/deals/api'

/** Stage colours (spec 2.8): the brand order for open stages, Midnight for Won, Sea Mist for Lost. */
export const STAGE_COLOR: Record<StageName, string> = {
  New: 'var(--sea-green)',
  Qualified: 'var(--marigold)',
  Proposal: 'var(--coral)',
  Negotiation: 'var(--cerulean)',
  Won: 'var(--midnight)',
  Lost: 'var(--sea-mist)',
}

/** Fills that carry small text, and the text colour on them (all at least 4.5:1). */
export const STAGE_FILL: Record<StageName, { background: string; color: string }> = {
  New: { background: 'var(--sea-green)', color: 'var(--midnight)' },
  Qualified: { background: 'var(--marigold)', color: 'var(--midnight)' },
  Proposal: { background: 'var(--coral)', color: 'var(--midnight)' },
  Negotiation: { background: 'var(--cerulean-solid)', color: '#fff' },
  Won: { background: 'var(--midnight)', color: '#fff' },
  Lost: { background: 'var(--sea-mist)', color: 'var(--midnight)' },
}

export function StageBadge({ stage }: { stage: StageName }) {
  return (
    <span className="pill" style={STAGE_FILL[stage]}>
      {stage}
    </span>
  )
}
