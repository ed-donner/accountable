import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test-utils'
import type { Activity } from './api'
import { Timeline } from './Timeline'

const base: Activity = {
  id: 1, kind: 'note', contact_id: null, contact_name: null, deal_id: 4, deal_name: 'Big deal', description: 'Called about budget',
  occurred_at: '2026-11-10T10:00:00Z', follow_up_date: null, follow_up_state: null, done: false, from_stage: null, to_stage: null,
}
const entries: Activity[] = [
  { ...base, id: 1, kind: 'stage_change', description: 'Moved from Proposal to Negotiation', from_stage: 'Proposal', to_stage: 'Negotiation' },
  { ...base, id: 2, kind: 'call', description: 'Chase the contract', follow_up_date: '2026-11-11', follow_up_state: 'overdue' },
  { ...base, id: 3, kind: 'email', description: 'Sent the quote' },
]

describe('Timeline', () => {
  it('shows each entry with its type, and stage changes as two badges with no actions (R34, D20)', () => {
    renderApp(<Timeline entries={entries} showLinkTo="deal" onEdit={vi.fn()} onDelete={vi.fn()} onToggleDone={vi.fn()} />)
    expect(screen.getByLabelText('Moved from Proposal to Negotiation')).toHaveTextContent('ProposalNegotiation')
    expect(screen.getAllByRole('button', { name: /^Actions for/ })).toHaveLength(2)
    expect(screen.getByText('Stage change')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Big deal' })).toHaveLength(3)
  })

  it('marks an overdue follow-up and lets it be marked done (R37, R38)', async () => {
    const onToggleDone = vi.fn()
    const user = userEvent.setup()
    renderApp(<Timeline entries={entries} showLinkTo="deal" onEdit={vi.fn()} onDelete={vi.fn()} onToggleDone={onToggleDone} />)
    expect(screen.getByText(/Follow up .* · overdue/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Mark done/ }))
    expect(onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), true)
  })

  it('says when nothing is logged', () => {
    renderApp(<Timeline entries={[]} showLinkTo="deal" onEdit={vi.fn()} onDelete={vi.fn()} onToggleDone={vi.fn()} />)
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
  })
})
