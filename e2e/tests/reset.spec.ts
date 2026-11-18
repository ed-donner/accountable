import { expect, reseed, rowAction, test } from '../fixtures'

// Intent success criterion 2: the reset command brings back the sample data, even with the app running (R4).
test('the seed command restores the sample data while the app is running', async ({ page }) => {
  await page.goto('/organizations')
  await rowAction(page, 'Lumen Cloud', 'Delete')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row')).toHaveCount(15)

  reseed()
  await page.reload()
  await expect(page.getByRole('row')).toHaveCount(16)
  await expect(page.getByRole('link', { name: 'Lumen Cloud' })).toBeVisible()
})
