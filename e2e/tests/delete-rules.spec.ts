import { dialog, expect, getJson, rowAction, test, toast } from '../fixtures'

// Intent success criterion 2: deleting asks first, unlinks rather than cascades (R26–R28).

test('an organization with deals cannot be deleted', async ({ page }) => {
  await page.goto('/organizations')
  await rowAction(page, 'Granite Build Co', 'Delete')
  const alert = page.getByRole('alertdialog')
  await expect(alert.getByRole('heading', { name: "Can't delete yet" })).toBeVisible()
  await expect(alert).toContainText('Granite Build Co has 4 deals. Move them to another organization or delete them first.')
  await expect(alert.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await alert.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('link', { name: 'Granite Build Co' })).toBeVisible()
})

test('deleting an organization without deals keeps its contacts', async ({ page, request }) => {
  await page.goto('/organizations')
  await rowAction(page, 'Lumen Cloud', 'Delete')
  await expect(page.getByRole('alertdialog')).toContainText('will stay, with no organization')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('link', { name: 'Lumen Cloud' })).toHaveCount(0)
  const contacts = await getJson<{ organization_name: string | null }[]>(request, '/contacts')
  expect(contacts).toHaveLength(40)
})

test('deleting a contact keeps their deals, with no main contact', async ({ page, request }) => {
  await page.goto('/contacts')
  await rowAction(page, 'Sam Becker', 'Delete')
  await expect(page.getByRole('alertdialog')).toContainText('Delete Sam Becker? Their 4 deals will stay, with no main contact.')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(toast(page, 'Contact deleted')).toBeVisible()
  const deals = await getJson<{ name: string; main_contact_id: number | null; contact_name: string | null }[]>(request, '/deals')
  const site = deals.find((d) => d.name === 'Site safety app')!
  expect(site.main_contact_id).toBeNull()

  await page.goto('/deals')
  await page.getByRole('link', { name: 'Site safety app' }).click()
  await expect(page.getByText('No main contact')).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
})
