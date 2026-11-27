import { dialog, expect, test, toast, TODAY } from '../fixtures'

// Intent success criteria 5 and 6: follow-ups show on Overview until they're marked done (R38, R50).

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const followUps = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Follow-ups' })

test('the sample follow-ups are grouped as overdue, due today and upcoming', async ({ page }) => {
  await page.goto('/')
  await expect(followUps(page).getByRole('heading', { name: 'Overdue · 2' })).toBeVisible()
  await expect(followUps(page).getByRole('heading', { name: 'Due today · 1' })).toBeVisible()
  await expect(followUps(page).getByRole('heading', { name: 'Upcoming · 3' })).toBeVisible()
  await expect(followUps(page).getByText('4 days overdue')).toBeVisible()
})

test('a new follow-up appears on Overview, and marking it done removes it', async ({ page }) => {
  await page.goto('/contacts')
  await page.getByRole('link', { name: 'Omar Haddad' }).click()
  await page.getByRole('button', { name: 'Log activity' }).click()
  await dialog(page).getByLabel('Description').fill('Send the rollout plan')
  await dialog(page).getByLabel(/Follow-up date/).fill(addDays(TODAY, 2))
  await dialog(page).getByRole('button', { name: 'Log activity' }).click()
  await expect(toast(page, 'Activity logged')).toBeVisible()

  await page.getByRole('link', { name: 'Overview' }).click()
  await expect(followUps(page).getByRole('heading', { name: 'Upcoming · 4' })).toBeVisible()
  const item = followUps(page).getByRole('listitem').filter({ hasText: 'Send the rollout plan' })
  await expect(item).toContainText('Omar Haddad')
  await item.getByRole('checkbox', { name: 'Mark done: Send the rollout plan' }).check()
  await expect(toast(page, 'Follow-up marked done')).toBeVisible()
  await expect(followUps(page).getByText('Send the rollout plan')).toHaveCount(0)
  await expect(followUps(page).getByRole('heading', { name: 'Upcoming · 3' })).toBeVisible()
})
