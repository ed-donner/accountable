import { test as base, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { E2E_ENV, ROOT, TODAY } from './env'

/** Reloads the sample data into the test database, the same way `npm run seed` does (R4). */
export function reseed() {
  execFileSync('uv', ['run', 'python', '-m', 'backend.app.seed', '--reset'], {
    cwd: ROOT,
    env: { ...process.env, ...E2E_ENV },
    stdio: 'ignore',
  })
}

export const test = base.extend<{ fresh: void; consoleGuard: void; allowConsole: RegExp[] }>({
  // Console messages a test causes on purpose, such as Chrome logging a request the test makes fail.
  allowConsole: [[], { option: true }],
  // Every test starts from the sample data, so tests never depend on each other.
  fresh: [
    async ({}, use) => {
      reseed()
      await use()
    },
    { auto: true },
  ],
  // R59: no errors or warnings in the browser console during normal use.
  consoleGuard: [
    async ({ page, allowConsole }, use) => {
      const problems: string[] = []
      page.on('console', (m) => {
        if ((m.type() === 'error' || m.type() === 'warning') && !allowConsole.some((r) => r.test(m.text())))
          problems.push(`${m.type()}: ${m.text()}`)
      })
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
      await use()
      expect(problems, 'the browser console should have no errors or warnings').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
export { TODAY }

type Deal = { id: number; name: string; stage: string; probability: number; close_date: string; position: number; value_cents: number }

export async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api${path}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as T
}

export const getDeals = (request: APIRequestContext) => getJson<Deal[]>(request, '/deals')

export async function dealNamed(request: APIRequestContext, name: string) {
  const deal = (await getDeals(request)).find((d) => d.name === name)
  if (!deal) throw new Error(`No deal named ${name}`)
  return deal
}

export async function columnNames(request: APIRequestContext, stage: string) {
  return (await getDeals(request))
    .filter((d) => d.stage === stage)
    .sort((a, b) => a.position - b.position)
    .map((d) => d.name)
}

/** "Nov 15" for today, as cards and tables show it. */
export function shortToday() {
  const [y, m, d] = TODAY.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** A toast message (Radix also repeats it in a screen-reader announcement, so match it exactly). */
export const toast = (page: Page, text: string) => page.getByText(text, { exact: true })

/** The open drawer or dialog. */
export const dialog = (page: Page) => page.getByRole('dialog')

/** A pipeline card by deal name. */
export const card = (page: Page, name: string) => page.locator('article[aria-roledescription="deal card"]', { hasText: name })

/** A pipeline column's card list. */
export const column = (page: Page, stage: string) => page.locator(`[data-stage="${stage}"]`)

/** Drags a card with the mouse, in small steps so dnd-kit sees a real drag. */
export async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  await from.scrollIntoViewIfNeeded()
  const box = (await from.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

/** Opens a row's ⋯ menu and picks an item. */
export async function rowAction(page: Page, name: string, item: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
