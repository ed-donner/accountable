import { dialog, expect, test } from '../fixtures'

// Intent success criterion 9: everything works with the keyboard alone, with visible focus (R57).

test('the sidebar and tables work from the keyboard, with a visible focus outline', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const first = page.getByRole('link', { name: 'Overview' })
  await expect(first).toBeFocused()
  const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).not.toBe('none')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: /^Deals/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/deals')

  // Sort a column with Enter.
  await page.getByRole('button', { name: /^Value/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('columnheader', { name: /Value/ })).toHaveAttribute('aria-sort', 'ascending')
})

test('the add drawer traps focus, closes with Escape and returns focus', async ({ page }) => {
  await page.goto('/organizations')
  const add = page.getByRole('button', { name: 'New organization' }).first()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByLabel('Name')).toBeFocused()
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
  expect(await dialog(page).evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(add).toBeFocused()
})

test('row menus open with the keyboard, and a delete dialog returns focus to the menu button', async ({ page }) => {
  await page.goto('/organizations')
  const menu = page.getByRole('button', { name: 'Actions for Granite Build Co' })
  await menu.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
  // The menu takes a moment before it moves on arrow keys; keep pressing until Delete has focus.
  await expect(async () => {
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused({ timeout: 250 })
  }).toPass()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alertdialog')).toContainText('Granite Build Co has 4 deals')
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
})
