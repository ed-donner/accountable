import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderApp } from '../../test-utils'
import { ContactForm } from './ContactForm'

describe('ContactForm', () => {
  it('needs a name, checks the email, and labels every field (R9, R58)', async () => {
    fakeApi({ 'GET /organizations': [] })
    const user = userEvent.setup()
    renderApp(<ContactForm open onOpenChange={vi.fn()} />)
    for (const label of ['Name', 'Status', /Organization/, /Job title/, /Email/, /Phone/]) expect(screen.getByLabelText(label)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Email/), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByText('Enter an email address like name@example.com')).toBeInTheDocument()
  })

  it('saves a new lead with empty fields as blanks (R9)', async () => {
    let sent: unknown
    fakeApi({ 'GET /organizations': [], 'POST /contacts': (body: unknown) => ((sent = body), { status: 201, json: { id: 1 } }) })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderApp(<ContactForm open onOpenChange={onOpenChange} />)
    await user.type(screen.getByLabelText('Name'), 'Jane Doe')
    await user.click(screen.getByRole('button', { name: 'Save contact' }))
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sent).toEqual({ name: 'Jane Doe', job_title: null, organization_id: null, status: 'lead', email: null, phone: null })
    expect(await screen.findByText('Contact saved')).toBeInTheDocument()
  })
})
