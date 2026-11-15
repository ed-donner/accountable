import { dialog, expect, getJson, rowAction, test, toast } from '../fixtures'

// Intent success criterion 2: add, search, sort, edit and delete in each table; changes persist (R5, R19–R22).

test('organizations: add, search, sort, edit, delete', async ({ page }) => {
  await page.goto('/organizations')
  await page.getByRole('button', { name: 'New organization' }).first().click()
  await dialog(page).getByLabel('Name').fill('Zephyr Labs')
  await dialog(page).getByLabel(/Industry/).fill('Software')
  await dialog(page).getByRole('button', { name: 'Save organization' }).click()
  await expect(toast(page, 'Organization saved')).toBeVisible()

  await page.getByLabel('Search organizations').fill('zephyr')
  await expect(page.getByRole('row')).toHaveCount(2)
  await page.reload()
  await page.getByLabel('Search organizations').fill('ZEPHYR')
  await expect(page.getByRole('link', { name: 'Zephyr Labs' })).toBeVisible()
  await page.getByLabel('Search organizations').fill('')

  await page.getByRole('button', { name: /^Name/ }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Atlas Software')
  await page.getByRole('button', { name: /^Name/ }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Zephyr Labs')

  await rowAction(page, 'Zephyr Labs', 'Edit')
  await dialog(page).getByLabel('Name').fill('Zephyr Labs Ltd')
  await dialog(page).getByRole('button', { name: 'Save organization' }).click()
  await expect(page.getByRole('link', { name: 'Zephyr Labs Ltd' })).toBeVisible()

  await rowAction(page, 'Zephyr Labs Ltd', 'Delete')
  await expect(page.getByRole('alertdialog')).toContainText('Delete Zephyr Labs Ltd? It has no contacts or deals.')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name: 'Zephyr Labs Ltd' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: /Zephyr/ })).toHaveCount(0)
})

test('contacts: add a lead, edit to customer, delete', async ({ page, request }) => {
  await page.goto('/contacts')
  await page.getByRole('button', { name: 'New contact' }).first().click()
  await dialog(page).getByLabel('Name').fill('Robin Quill')
  await dialog(page).getByLabel(/Organization/).selectOption({ label: 'Lumen Cloud' })
  await dialog(page).getByLabel(/Email/).fill('robin.quill@example.com')
  await dialog(page).getByRole('button', { name: 'Save contact' }).click()
  await expect(toast(page, 'Contact saved')).toBeVisible()
  await page.getByLabel('Search contacts').fill('robin')
  await expect(page.getByRole('row').nth(1)).toContainText('Lead')

  await rowAction(page, 'Robin Quill', 'Edit')
  await dialog(page).getByLabel('Status').selectOption('customer')
  await dialog(page).getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Customer')
  await page.reload()
  await page.getByLabel('Search contacts').fill('robin')
  await expect(page.getByRole('row').nth(1)).toContainText('Customer')

  await rowAction(page, 'Robin Quill', 'Delete')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('No contacts match “robin”.')).toBeVisible()
  const all = await getJson<{ name: string }[]>(request, '/contacts')
  expect(all.some((c) => c.name === 'Robin Quill')).toBe(false)
})

test('deals: add, sort by value, edit, delete', async ({ page, request }) => {
  await page.goto('/deals')
  await page.getByRole('button', { name: 'New deal' }).first().click()
  await dialog(page).getByLabel('Name').fill('Warehouse robots')
  await dialog(page).getByLabel('Organization', { exact: true }).selectOption({ label: 'Bluefin Freight' })
  await dialog(page).getByLabel('Value (USD)').fill('250000')
  await dialog(page).getByLabel('Close date').fill('2030-01-15')
  await dialog(page).getByRole('button', { name: 'Save deal' }).click()
  await expect(toast(page, 'Deal saved')).toBeVisible()

  await page.getByRole('button', { name: /^Value/ }).click()
  await page.getByRole('button', { name: /^Value/ }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Warehouse robots')
  await expect(page.getByRole('row').nth(1)).toContainText('$250,000')
  await expect(page.getByRole('row').nth(1)).toContainText('10%') // New takes 10% (R14)

  await rowAction(page, 'Warehouse robots', 'Edit')
  await dialog(page).getByLabel('Value (USD)').fill('260000')
  await dialog(page).getByRole('button', { name: 'Save deal' }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('$260,000')

  await rowAction(page, 'Warehouse robots', 'Delete')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name: 'Warehouse robots' })).toHaveCount(0)
  const deals = await getJson<{ name: string }[]>(request, '/deals')
  expect(deals.some((d) => d.name === 'Warehouse robots')).toBe(false)
})

test('a form shows errors next to the fields', async ({ page }) => {
  await page.goto('/deals')
  await page.getByRole('button', { name: 'New deal' }).first().click()
  await dialog(page).getByRole('button', { name: 'Save deal' }).click()
  await expect(dialog(page).getByLabel('Name')).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog(page).getByText('Enter a name')).toBeVisible()
  await expect(dialog(page).getByText('Enter a close date')).toBeVisible()
})
