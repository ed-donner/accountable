import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderApp } from '../../test-utils'
import { ActivityForm } from './ActivityForm'

const contacts = [
  { id: 1, name: 'Ann', organization_name: 'Acme' },
  { id: 2, name: 'Ben', organization_name: 'Acme' },
  { id: 3, name: 'Cat', organization_name: null },
]

describe('ActivityForm', () => {
  it('from a deal, offers any contact with the main contact first (R35)', async () => {
    fakeApi({ 'GET /contacts': contacts })
    renderApp(<ActivityForm open onOpenChange={vi.fn()} context={{ kind: 'deal', id: 5, name: 'Deal', mainContactId: 3 }} />)
    const select = screen.getByLabelText(/Contact/)
    await within(select).findByText('Cat (main contact)')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['No contact', 'Cat (main contact)', 'Ann, Acme', 'Ben, Acme'])
    expect(select).toHaveValue('3')
  })

  it('from a contact, offers their deals, and logs a follow-up (R35, R38)', async () => {
    let sent: Record<string, unknown> = {}
    fakeApi({ 'GET /contacts': [], 'POST /activities': (body: unknown) => ((sent = body as Record<string, unknown>), { status: 201, json: { id: 1 } }) })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderApp(<ActivityForm open onOpenChange={onOpenChange} context={{ kind: 'contact', id: 9, name: 'Ann', deals: [{ id: 4, name: 'Big deal' }] }} />)
    await user.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(await screen.findByText('Describe what happened')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Type'), 'call')
    await user.type(screen.getByLabelText('Description'), 'Discussed pricing')
    await user.type(screen.getByLabelText(/Follow-up date/), '2026-11-20')
    await user.selectOptions(screen.getByLabelText(/Deal/), '4')
    await user.click(screen.getByRole('button', { name: 'Log activity' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sent).toMatchObject({ kind: 'call', description: 'Discussed pricing', follow_up_date: '2026-11-20', contact_id: 9, deal_id: 4 })
    expect(typeof sent.occurred_at).toBe('string')
  })
})
