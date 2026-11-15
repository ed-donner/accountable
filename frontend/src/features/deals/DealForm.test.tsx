import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderApp } from '../../test-utils'
import { DealForm } from './DealForm'

const STAGES = [
  { name: 'New', probability: 10, open: true },
  { name: 'Qualified', probability: 25, open: true },
  { name: 'Proposal', probability: 50, open: true },
  { name: 'Negotiation', probability: 75, open: true },
  { name: 'Won', probability: 100, open: false },
  { name: 'Lost', probability: 0, open: false },
]
const lists = {
  'GET /organizations': [{ id: 1, name: 'Acme' }],
  'GET /contacts': [{ id: 7, name: 'Ann', organization_name: 'Acme' }],
  'GET /stages': STAGES,
}

describe('DealForm', () => {
  it('labels every field and shows errors next to them (R10, R58)', async () => {
    fakeApi(lists)
    const user = userEvent.setup()
    renderApp(<DealForm open onOpenChange={vi.fn()} />)
    for (const label of ['Name', 'Organization', /Main contact/, 'Stage', 'Value (USD)', /Probability of close/, 'Close date']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Save deal' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByLabelText('Organization')).toHaveAccessibleDescription('Choose an organization')
    expect(screen.getByText('Enter a value')).toBeInTheDocument()
    expect(screen.getByText('Enter a close date')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter a name')
  })

  it('sends cents, leaves out a blank probability, and uses the column’s stage (R14, R42, D4)', async () => {
    let sent: Record<string, unknown> = {}
    fakeApi({ ...lists, 'POST /deals': (body: unknown) => ((sent = body as Record<string, unknown>), { status: 201, json: { id: 9 } }) })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderApp(<DealForm open onOpenChange={onOpenChange} defaultStage="Proposal" />)
    await screen.findByRole('option', { name: 'Acme' })
    await user.type(screen.getByLabelText('Name'), 'Big deal')
    await user.selectOptions(screen.getByLabelText('Organization'), '1')
    await user.type(screen.getByLabelText('Value (USD)'), '12500.5')
    await user.type(screen.getByLabelText('Close date'), '2026-12-31')
    expect(screen.getByText(/leave blank for the usual 50%/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save deal' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sent).toEqual({ name: 'Big deal', organization_id: 1, main_contact_id: null, stage: 'Proposal', value_cents: 1250050, close_date: '2026-12-31' })
  })

  it('shows a server error on the right field', async () => {
    fakeApi({ ...lists, 'POST /deals': () => ({ status: 422, json: { detail: 'x', fields: { value_cents: 'Must be 0 or more' } } }) })
    const user = userEvent.setup()
    renderApp(<DealForm open onOpenChange={vi.fn()} />)
    await screen.findByRole('option', { name: 'Acme' })
    await user.type(screen.getByLabelText('Name'), 'X')
    await user.selectOptions(screen.getByLabelText('Organization'), '1')
    await user.type(screen.getByLabelText('Value (USD)'), '5')
    await user.type(screen.getByLabelText('Close date'), '2026-12-31')
    await user.click(screen.getByRole('button', { name: 'Save deal' }))
    expect(await screen.findByText('Must be 0 or more')).toBeInTheDocument()
    expect(screen.getByLabelText('Value (USD)')).toHaveAttribute('aria-invalid', 'true')
  })
})
