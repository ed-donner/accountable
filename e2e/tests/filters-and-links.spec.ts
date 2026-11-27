import { expect, test } from '../fixtures'

// Intent success criterion 3: filter contacts by status; record pages show linked records (R23, R31–R33).

test('contacts can be filtered by status', async ({ page }) => {
  await page.goto('/contacts')
  const filter = page.getByRole('group', { name: 'Filter by status' })
  await filter.getByRole('button', { name: 'Lead' }).click()
  await expect(filter.getByRole('button', { name: 'Lead' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('row')).toHaveCount(12)
  for (const row of await page.getByRole('row').all().then((rows) => rows.slice(1))) await expect(row).toContainText('Lead')
  await filter.getByRole('button', { name: 'Customer' }).click()
  await expect(page.getByRole('row')).toHaveCount(19)
  await filter.getByRole('button', { name: 'All' }).click()
  await expect(page.getByRole('row')).toHaveCount(41)
})

test('record pages link to each other', async ({ page }) => {
  await page.goto('/organizations')
  await page.getByRole('link', { name: 'Atlas Software' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Atlas Software' })).toBeVisible()
  await expect(page.getByText('$151,000')).toBeVisible() // open deals: 31,000 + 120,000
  await page.getByRole('link', { name: 'Dana Whitfield' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Dana Whitfield' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Atlas Software' })).toBeVisible()
  await page.getByRole('link', { name: 'Data platform license' }).first().click()

  await expect(page.getByRole('heading', { level: 1, name: 'Data platform license' })).toBeVisible()
  await expect(page.getByText('$90,000')).toBeVisible() // expected revenue: 120,000 × 75%
  await expect(page.getByRole('link', { name: 'Dana Whitfield' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Atlas Software' }).click()
  await expect(page).toHaveURL(/\/organizations\/\d+$/)
})
