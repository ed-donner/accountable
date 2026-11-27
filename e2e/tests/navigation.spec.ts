import { expect, test } from '../fixtures'

// D15, D16, R39: the sidebar opens each section; every page has its own URL.
test('the sidebar marks the current section and opens each one', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Sections' })
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: /Pipeline/ })).toContainText('17')
  for (const [name, url] of [
    ['Pipeline', '/pipeline'],
    ['Deals', '/deals'],
    ['Contacts', '/contacts'],
    ['Organizations', '/organizations'],
    ['Overview', '/'],
  ] as const) {
    await nav.getByRole('link', { name: new RegExp(`^${name}`) }).click()
    await expect(page).toHaveURL(url)
    await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-current', 'page')
  }
})

test('pipeline opens directly, survives a refresh, and the back button works', async ({ page }) => {
  await page.goto('/pipeline')
  await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible()
  await page.getByRole('link', { name: /^Deals/ }).click()
  await page.getByRole('link', { name: 'Route optimization' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Route optimization' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Route optimization' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/deals')
  await page.goBack()
  await expect(page).toHaveURL('/pipeline')
})
