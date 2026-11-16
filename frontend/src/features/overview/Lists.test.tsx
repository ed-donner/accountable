import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeApi, renderApp } from '../../test-utils'
import type { Activity } from '../activities/api'
import type { Dashboard } from './api'
import { FollowUps } from './Lists'

const followUp: Activity = {
  id: 5, kind: 'call', contact_id: 2, contact_name: 'Ann', deal_id: null, deal_name: null, description: 'Call Ann back',
  occurred_at: '2026-11-10T09:00:00Z', follow_up_date: '2026-11-12', follow_up_state: 'overdue', done: false,
  from_stage: null, to_stage: null,
}
const data = { today: '2026-11-15', follow_ups: { overdue: [followUp], today: [], upcoming: [] } } as unknown as Dashboard

describe('FollowUps (R50)', () => {
  it('unticks a follow-up again when marking it done fails', async () => {
    fakeApi({ 'PATCH /activities/5': () => ({ status: 500, json: { detail: 'The server had a problem.' } }) })
    const user = userEvent.setup()
    renderApp(<FollowUps data={data} />)
    const box = screen.getByRole('checkbox', { name: 'Mark done: Call Ann back' })
    await user.click(box)
    expect(await screen.findAllByText('The server had a problem.')).not.toHaveLength(0)
    expect(box).not.toBeChecked()
  })

  it('stays ticked while it saves', async () => {
    let finish: () => void = () => {}
    const saved = new Promise<void>((resolve) => (finish = resolve))
    const fetchMock = fakeApi({ 'PATCH /activities/5': { json: { ...followUp, done: true } } })
    fetchMock.mockImplementationOnce(async () => (await saved, new Response(JSON.stringify({ ...followUp, done: true }))))
    const user = userEvent.setup()
    renderApp(<FollowUps data={data} />)
    const box = screen.getByRole('checkbox', { name: 'Mark done: Call Ann back' })
    await user.click(box)
    expect(box).toBeChecked()
    finish()
  })
})
