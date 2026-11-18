import { card, column, dialog, drag, expect, test, toast } from '../fixtures'

// Intent success criterion 5: activities show in every timeline they belong to, newest first (R12, R34–R36).

test('an activity logged on a contact and naming a deal shows in both timelines', async ({ page }) => {
  await page.goto('/contacts')
  await page.getByRole('link', { name: 'Grace Liu' }).click()
  await page.getByRole('button', { name: 'Log activity' }).click()
  await dialog(page).getByLabel('Type').selectOption('call')
  await dialog(page).getByLabel('Description').fill('Walked through the treasury figures')
  await dialog(page).getByLabel(/Deal/).selectOption({ label: 'Treasury dashboard' })
  await dialog(page).getByRole('button', { name: 'Log activity' }).click()
  await expect(toast(page, 'Activity logged')).toBeVisible()

  const contactTimeline = page.getByRole('region', { name: 'Timeline' }).getByRole('listitem')
  await expect(contactTimeline.first()).toContainText('Walked through the treasury figures')
  await expect(contactTimeline.first()).toContainText('Today')

  await contactTimeline.first().getByRole('link', { name: 'Treasury dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Treasury dashboard' })).toBeVisible()
  const dealTimeline = page.getByRole('region', { name: 'Timeline' }).getByRole('listitem')
  await expect(dealTimeline.filter({ hasText: 'Walked through the treasury figures' })).toContainText('Grace Liu')
})

test('a stage change adds an entry to the deal timeline', async ({ page }) => {
  await page.goto('/pipeline')
  const target = (await column(page, 'Proposal').boundingBox())!
  await drag(page, card(page, 'Warehouse analytics'), { x: target.x + target.width / 2, y: target.y + 30 })
  await expect(toast(page, 'Warehouse analytics moved to Proposal')).toBeVisible()
  await page.goto('/deals')
  await page.getByRole('link', { name: 'Warehouse analytics' }).click()
  const first = page.getByRole('region', { name: 'Timeline' }).getByRole('listitem').first()
  await expect(first.getByLabel('Moved from Qualified to Proposal')).toBeVisible()
  await expect(first).toContainText('Today')
  await expect(first.getByRole('button', { name: /^Actions for/ })).toHaveCount(0) // stage changes can't be edited (D5)
})

test('an activity can be edited and deleted', async ({ page }) => {
  await page.goto('/deals')
  await page.getByRole('link', { name: 'Warehouse analytics' }).click()
  const entry = page.getByRole('region', { name: 'Timeline' }).getByRole('listitem').filter({ hasText: 'Finance team wants a second quote' })
  await entry.getByRole('button', { name: /^Actions for note/ }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await dialog(page).getByLabel('Description').fill('Finance team wants a third quote')
  await dialog(page).getByRole('button', { name: 'Save activity' }).click()
  const edited = page.getByRole('region', { name: 'Timeline' }).getByRole('listitem').filter({ hasText: 'Finance team wants a third quote' })
  await expect(edited).toBeVisible()
  await edited.getByRole('button', { name: /^Actions for note/ }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Finance team wants a third quote')).toHaveCount(0)
})
