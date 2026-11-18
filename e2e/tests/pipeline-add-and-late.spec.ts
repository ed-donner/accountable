import { card, column, columnNames, dealNamed, dialog, expect, test } from '../fixtures'

// Intent success criterion 4: a deal added in a column starts at that stage; late deals stand out (R17, R42).

test('a deal added from a column starts at that stage, at the top', async ({ page, request }) => {
  await page.goto('/pipeline')
  await page.getByRole('button', { name: 'Add a deal to Proposal' }).click()
  await expect(dialog(page).getByLabel('Stage')).toHaveValue('Proposal')
  await dialog(page).getByLabel('Name').fill('Yard management')
  await dialog(page).getByLabel('Organization', { exact: true }).selectOption({ label: 'Oakline Builders' })
  await dialog(page).getByLabel('Value (USD)').fill('15000')
  await dialog(page).getByLabel('Close date').fill('2030-03-01')
  await dialog(page).getByRole('button', { name: 'Save deal' }).click()
  await expect(column(page, 'Proposal').locator('article').first()).toContainText('Yard management')
  expect((await columnNames(request, 'Proposal'))[0]).toBe('Yard management')
  expect((await dealNamed(request, 'Yard management')).probability).toBe(50)
})

test('late deals show a Late tag on their card and in the Deals table', async ({ page }) => {
  await page.goto('/pipeline')
  for (const name of ['Site safety app', 'Loyalty program', 'Field crew scheduling', 'Telehealth add-on']) {
    await expect(card(page, name).getByText('Late', { exact: true })).toBeVisible()
  }
  await expect(card(page, 'Route optimization').getByText('Late', { exact: true })).toHaveCount(0)
  await expect(page.locator('article .late-tag')).toHaveCount(4)

  await page.goto('/deals')
  await expect(page.getByRole('row', { name: /Site safety app/ }).getByText('Late', { exact: true })).toBeVisible()
  await expect(page.locator('tbody .late-tag')).toHaveCount(4)
})
