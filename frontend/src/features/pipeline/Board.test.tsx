import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test-utils'
import type { Deal, StageName } from '../deals/api'
import { PipelinePage } from './PipelinePage'

const STAGES = [
  { name: 'New', probability: 10, open: true },
  { name: 'Qualified', probability: 25, open: true },
  { name: 'Proposal', probability: 50, open: true },
  { name: 'Negotiation', probability: 75, open: true },
  { name: 'Won', probability: 100, open: false },
  { name: 'Lost', probability: 0, open: false },
]
const deal = (id: number, name: string, stage: StageName, value: number, probability: number): Deal => ({
  id, name, organization_id: 1, organization_name: 'Acme', main_contact_id: null, contact_name: null, stage,
  value_cents: value, probability, expected_cents: (value * probability) / 100, close_date: '2026-12-01', is_late: false, position: 0,
})
const DEALS = [deal(1, 'Site safety app', 'New', 1_000_000, 10), deal(2, 'Data platform', 'Negotiation', 2_000_000, 75)]

describe('Pipeline', () => {
  it('moves a card at once, then puts it back with a message when saving fails (R43, R44, D12)', async () => {
    let failMove: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/deals/1/move' && init?.method === 'POST')
          return new Promise((resolve) => (failMove = () => resolve(new Response(JSON.stringify({ detail: 'Server error' }), { status: 500 }))))
        const json = url === '/api/stages' ? STAGES : url === '/api/deals' ? DEALS : []
        return Promise.resolve(new Response(JSON.stringify(json), { status: 200 }))
      }),
    )
    const user = userEvent.setup()
    renderApp(<PipelinePage />)
    const newColumn = await screen.findByRole('region', { name: /^New/ })
    expect(within(newColumn).getByText('Site safety app')).toBeInTheDocument()
    expect(screen.getByTestId('open-value')).toHaveTextContent('$30,000')

    // Move it to Won with the card's "Move to…" menu (R41), using the keyboard.
    screen.getByRole('button', { name: 'Actions for Site safety app' }).focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitem', { name: 'Won' }))

    // Before the server answers, the card and the totals have already moved.
    const wonColumn = screen.getByRole('region', { name: /^Won/ })
    expect(await within(wonColumn).findByText('Site safety app')).toBeInTheDocument()
    expect(screen.getByTestId('open-value')).toHaveTextContent('$20,000')

    failMove()
    expect(await screen.findByText(/Couldn't move Site safety app, so it's back where it was/)).toBeInTheDocument()
    expect(await within(screen.getByRole('region', { name: /^New/ })).findByText('Site safety app')).toBeInTheDocument()
    expect(screen.getByTestId('open-value')).toHaveTextContent('$30,000')
  })
})
