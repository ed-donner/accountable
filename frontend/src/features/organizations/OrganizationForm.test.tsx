import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderApp } from '../../test-utils'
import { OrganizationForm } from './OrganizationForm'

describe('OrganizationForm', () => {
  it('needs a name (R8, R58)', async () => {
    fakeApi({})
    const user = userEvent.setup()
    renderApp(<OrganizationForm open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save organization' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name')
  })

  it('edits an existing organization with PATCH', async () => {
    let sent: unknown
    fakeApi({ 'PATCH /organizations/4': (body: unknown) => ((sent = body), { json: { id: 4 } }) })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    const org = { id: 4, name: 'Acme', website: null, industry: 'Retail', notes: null, contact_count: 0, deal_count: 0, open_deal_value_cents: 0 }
    renderApp(<OrganizationForm open onOpenChange={onOpenChange} organization={org} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Acme')
    await user.clear(screen.getByLabelText(/Industry/))
    await user.type(screen.getByLabelText(/Industry/), 'Software')
    await user.click(screen.getByRole('button', { name: 'Save organization' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sent).toEqual({ name: 'Acme', website: null, industry: 'Software', notes: null })
  })

  it('takes a bare web address but not another kind of link, and keeps names short', async () => {
    fakeApi({})
    const user = userEvent.setup()
    renderApp(<OrganizationForm open onOpenChange={vi.fn()} />)
    await user.type(screen.getByLabelText('Name'), 'x'.repeat(201))
    await user.type(screen.getByLabelText(/Website/), 'file:///etc/passwd')
    await user.click(screen.getByRole('button', { name: 'Save organization' }))
    expect(await screen.findByText('Enter a web address starting with http:// or https://')).toBeInTheDocument()
    expect(screen.getByText('Keep this to 200 characters or fewer')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Website/))
    await user.type(screen.getByLabelText(/Website/), 'acme.com:8080')
    await user.click(screen.getByRole('button', { name: 'Save organization' }))
    await vi.waitFor(() => expect(screen.queryByText(/Enter a web address/)).not.toBeInTheDocument())
  })
})
