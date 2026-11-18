import { dealNamed, expect, getJson, test } from '../fixtures'

// Intent success criteria 6 and 7: the figures match the data and follow a deal marked won (R45–R48, R51).

type Dashboard = {
  open_value_cents: number
  open_expected_cents: number
  won_this_month: { revenue_cents: number }
  win_rate: number
  funnel: { stage: string; value_cents: number; count: number }[]
}
const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US')

test('tiles, charts and funnel are shown and match the data', async ({ page, request }) => {
  const d = await getJson<Dashboard>(request, '/dashboard')
  await page.goto('/')
  await expect(page.getByTestId('tile-open-value')).toHaveText(money(d.open_value_cents))
  await expect(page.getByTestId('tile-expected')).toHaveText(money(d.open_expected_cents))
  await expect(page.getByTestId('tile-won-month')).toHaveText(money(d.won_this_month.revenue_cents))
  await expect(page.getByTestId('tile-win-rate')).toHaveText(`${d.win_rate}%`)
  // A line chart, a bar chart and the funnel, drawn by Recharts.
  await expect(page.locator('.recharts-area-curve')).toHaveCount(1)
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(12)
  await expect(page.locator('.recharts-funnel-trapezoid')).toHaveCount(5)
  for (const f of d.funnel) await expect(page.getByRole('region', { name: 'Sales funnel' })).toContainText(`${f.stage}${money(f.value_cents)}${f.count} deals`)
})

test('marking a deal won updates the figures', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByTestId('tile-won-month')).toHaveText('$54,000')
  const deal = await dealNamed(request, 'Data platform license')
  const response = await request.post(`/api/deals/${deal.id}/move`, { data: { stage: 'Won', index: 0 } })
  expect(response.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('tile-won-month')).toHaveText('$174,000')
  await expect(page.getByTestId('tile-open-value')).toHaveText('$586,300')
  await expect(page.getByTestId('tile-win-rate')).toHaveText('83%')
})
