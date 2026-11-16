import { card, columnNames, dealNamed, expect, test, toast } from '../fixtures'

// Intent success criteria 4 and 9: a deal can be moved with the keyboard alone (R41).

test('Space, arrow keys and Space move a card between and within columns', async ({ page, request }) => {
  await page.goto('/pipeline')
  await card(page, 'Clinic scheduling suite').focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('status').filter({ hasText: 'Picked up Clinic scheduling suite' })).toHaveCount(1)
  // Each key waits for its announcement, as a screen reader user would hear it.
  const announced = (text: string) => expect(page.getByRole('status').filter({ hasText: text })).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await announced('Clinic scheduling suite is now in Qualified, position 2 of 6')
  await page.keyboard.press('ArrowRight')
  await announced('Clinic scheduling suite is now in Proposal, position 2 of 5')
  await page.keyboard.press('ArrowDown')
  await announced('Clinic scheduling suite is now in Proposal, position 3 of 5')
  await page.keyboard.press('Space')
  await expect.poll(() => columnNames(request, 'Proposal')).toEqual([
    'Field crew scheduling',
    'Annual support renewal',
    'Clinic scheduling suite',
    'Claims automation',
    'Inventory forecasting',
  ])
  expect((await dealNamed(request, 'Clinic scheduling suite')).probability).toBe(50)
})

test('Escape cancels a keyboard move', async ({ page, request }) => {
  await page.goto('/pipeline')
  await card(page, 'Warehouse analytics').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('status').filter({ hasText: 'Move cancelled' })).toHaveCount(1)
  expect((await dealNamed(request, 'Warehouse analytics')).stage).toBe('Qualified')
})

test('the Move to menu moves a card', async ({ page, request }) => {
  await page.goto('/pipeline')
  await page.getByRole('button', { name: 'Actions for Telehealth add-on' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toContainText('Move to…')
  // The menu focuses its first item as it opens; wait for that, or it can take focus back from Lost.
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.getByRole('menuitem', { name: 'Lost' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Telehealth add-on moved to Lost')).toBeVisible()
  await expect.poll(async () => (await dealNamed(request, 'Telehealth add-on')).stage).toBe('Lost')
  await expect(page.getByRole('button', { name: 'Actions for Telehealth add-on' })).toBeFocused()
})
