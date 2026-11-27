import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderApp } from '../test-utils'
import { ConfirmDialog } from './ConfirmDialog'

function Harness({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete Acme</button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete organization" previewPath="/organizations/1/delete-preview" onConfirm={onConfirm} />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('says what will happen, and deletes only after confirming (R26, D22)', async () => {
    fakeApi({ 'GET /organizations/1/delete-preview': { blocked: false, message: 'Delete Acme? Its 2 contacts will stay, with no organization.' } })
    const onConfirm = vi.fn(async () => {})
    const user = userEvent.setup()
    renderApp(<Harness onConfirm={onConfirm} />)
    await user.click(screen.getByText('Delete Acme'))
    expect(await screen.findByText('Delete Acme? Its 2 contacts will stay, with no organization.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('explains a blocked delete and only offers Close (R27)', async () => {
    fakeApi({
      'GET /organizations/1/delete-preview': { blocked: true, message: 'Acme has 3 deals. Move them to another organization or delete them first.' },
    })
    const user = userEvent.setup()
    renderApp(<Harness onConfirm={vi.fn()} />)
    await user.click(screen.getByText('Delete Acme'))
    expect(await screen.findByText(/Acme has 3 deals/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Can't delete yet" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('traps focus, closes on Escape and returns focus (R57)', async () => {
    fakeApi({ 'GET /organizations/1/delete-preview': { blocked: false, message: 'Delete Acme?' } })
    const user = userEvent.setup()
    renderApp(<Harness onConfirm={vi.fn()} />)
    const opener = screen.getByText('Delete Acme')
    await user.click(opener)
    await screen.findByText('Delete Acme?')
    expect(screen.getByRole('alertdialog')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(opener).toHaveFocus())
  })

  it('shows the server’s reason when the delete fails', async () => {
    fakeApi({ 'GET /organizations/1/delete-preview': { blocked: false, message: 'Delete Acme?' } })
    const { ApiError } = await import('../api')
    const user = userEvent.setup()
    renderApp(<Harness onConfirm={() => Promise.reject(new ApiError(409, 'Acme has 1 deal.'))} />)
    await user.click(screen.getByText('Delete Acme'))
    await screen.findByText('Delete Acme?')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acme has 1 deal.')
  })
})
