import { card, column, dealNamed, drag, expect, shortToday, test, toast } from '../fixtures'
import type { Page } from '@playwright/test'

// D12, R43, R44: the board and its totals change before the server replies, and a failed move
// goes back on its own, without undoing other moves.

/** Holds every move request until `release` is called. */
async function holdMoves(page: Page) {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/deals/*/move', async (route) => {
    await held
    await route.continue()
  })
  return release
}

async function moveTo(page: Page, deal: string, stage: string) {
  const actions = page.getByRole('button', { name: `Actions for ${deal}` })
  await actions.click()
  await page.getByRole('menuitem', { name: stage }).click()
  // Focus goes back to the moved card's menu button (R57); wait for it before doing anything else.
  await expect(actions).toBeFocused()
}

test('totals, the card and its close date change before the server replies', async ({ page, request }) => {
  await page.goto('/pipeline')
  await expect(page.getByTestId('open-expected')).toHaveText('$292,255')
  const release = await holdMoves(page)

  const target = (await column(page, 'Negotiation').boundingBox())!
  await drag(page, card(page, 'Supplier portal'), { x: target.x + target.width / 2, y: target.y + 30 })
  await expect(column(page, 'Negotiation')).toContainText('Supplier portal')
  await expect(page.getByTestId('open-expected')).toHaveText('$299,505')

  // Moving a late deal to Won: it closes today and is no longer late, straight away (R16, R17).
  await expect(card(page, 'Telehealth add-on')).toContainText('Late')
  await moveTo(page, 'Telehealth add-on', 'Won')
  await expect(column(page, 'Won')).toContainText('Telehealth add-on')
  await expect(card(page, 'Telehealth add-on')).toContainText(shortToday())
  await expect(card(page, 'Telehealth add-on')).not.toContainText('Late')

  // Nothing has reached the server yet.
  expect((await dealNamed(request, 'Supplier portal')).stage).toBe('Qualified')
  release()
  await expect.poll(async () => (await dealNamed(request, 'Supplier portal')).stage).toBe('Negotiation')
  await expect.poll(async () => (await dealNamed(request, 'Telehealth add-on')).stage).toBe('Won')
})

test.describe('when a move fails', () => {
  // Chrome logs the failed request in the console; that's the point of this test.
  test.use({ allowConsole: [/Failed to load resource: the server responded with a status of 500/] })

  test('only that card goes back, even while another move is still saving', async ({ page, request }) => {
    await page.goto('/pipeline')
    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const first = new Promise<void>((resolve) => (releaseFirst = resolve))
    const second = new Promise<void>((resolve) => (releaseSecond = resolve))
    let calls = 0
    await page.route('**/api/deals/*/move', async (route) => {
      if (++calls === 1) {
        await first
        return route.fulfill({ status: 500, json: { detail: 'The server had a problem.' } })
      }
      await second
      return route.continue()
    })

    await moveTo(page, 'Telehealth add-on', 'Lost') // fails once released
    await expect(column(page, 'Lost')).toContainText('Telehealth add-on')
    await moveTo(page, 'Supplier portal', 'Negotiation') // still saving when the first fails
    await expect(column(page, 'Negotiation')).toContainText('Supplier portal')

    releaseFirst()
    await expect(toast(page, "Couldn't move Telehealth add-on, so it's back where it was. The server had a problem.")).toBeVisible()
    await expect(column(page, 'Negotiation')).toContainText('Telehealth add-on')
    await expect(column(page, 'Lost')).not.toContainText('Telehealth add-on')
    await expect(column(page, 'Negotiation')).toContainText('Supplier portal')
    expect((await dealNamed(request, 'Supplier portal')).stage).toBe('Qualified') // not saved yet

    releaseSecond()
    await expect.poll(async () => (await dealNamed(request, 'Supplier portal')).stage).toBe('Negotiation')
    await expect(column(page, 'Negotiation')).toContainText('Supplier portal')
    expect((await dealNamed(request, 'Telehealth add-on')).stage).toBe('Negotiation')
  })
})

test('a card can be dragged while the board is filtered by search', async ({ page, request }) => {
  await page.goto('/pipeline')
  await page.getByLabel('Search deals').fill('Supplier')
  await expect(card(page, 'Route optimization')).toHaveCount(0)
  const target = (await column(page, 'Proposal').boundingBox())!
  await drag(page, card(page, 'Supplier portal'), { x: target.x + target.width / 2, y: target.y + 30 })
  await expect.poll(async () => (await dealNamed(request, 'Supplier portal')).stage).toBe('Proposal')
  await expect(column(page, 'Proposal')).toContainText('Supplier portal')
})
