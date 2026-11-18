import { expect, test } from '../fixtures'

// Intent success criterion 1: start, land on the dashboard, with sample data on every screen (R1, R3, R52).
test('lands on Overview with the sample data', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await expect(page.getByTestId('tile-open-value')).toHaveText('$706,300')
  await expect(page.getByTestId('tile-expected')).toHaveText('$292,255')
  await expect(page.getByText('17 open deals')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Revenue won' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deals won' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sales funnel' })).toBeVisible()
})

test('every section has sample data', async ({ page }) => {
  const sections = [
    { link: 'Pipeline', check: () => expect(page.locator('article[aria-roledescription="deal card"]')).toHaveCount(34) },
    { link: 'Deals', check: () => expect(page.getByRole('row')).toHaveCount(35) },
    { link: 'Contacts', check: () => expect(page.getByRole('row')).toHaveCount(41) },
    { link: 'Organizations', check: () => expect(page.getByRole('row')).toHaveCount(16) },
  ]
  await page.goto('/')
  for (const s of sections) {
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: new RegExp(`^${s.link}`) }).click()
    await expect(page.getByRole('heading', { level: 1, name: s.link })).toBeVisible()
    await s.check()
  }
})

// R2 and plan risk 8: the app runs with no internet. Every request it makes stays on this computer.
test('makes no requests beyond this computer', async ({ page }) => {
  const outside: string[] = []
  await page.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => (outside.push(route.request().url()), route.abort()),
  )
  for (const path of ['/', '/pipeline', '/deals', '/contacts', '/organizations']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /^Organizations/ }).click()
  await page.getByRole('link', { name: 'Granite Build Co' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Granite Build Co' })).toBeVisible()
  expect(outside).toEqual([])
})
