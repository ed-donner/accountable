import { card, column, columnNames, dealNamed, drag, expect, shortToday, test, TODAY } from '../fixtures'

// Intent success criterion 4: dragging changes stage and probability; Won sets today; positions persist (R15, R16, R40, R43).

test('dragging a card to another column changes its stage and probability', async ({ page, request }) => {
  await page.goto('/pipeline')
  await expect(page.getByTestId('open-expected')).toHaveText('$292,255')
  const target = (await column(page, 'Negotiation').boundingBox())!
  await drag(page, card(page, 'Supplier portal'), { x: target.x + target.width / 2, y: target.y + 30 })

  await expect(column(page, 'Negotiation')).toContainText('Supplier portal')
  // 14,500 moves from 25% to 75%: expected revenue rises by 7,250 (R43)
  await expect(page.getByTestId('open-expected')).toHaveText('$299,505')
  await expect.poll(async () => (await dealNamed(request, 'Supplier portal')).stage).toBe('Negotiation')
  expect((await dealNamed(request, 'Supplier portal')).probability).toBe(75)

  // The Deals table shows the new stage and probability.
  await page.goto('/deals')
  const row = page.getByRole('row', { name: /Supplier portal/ })
  await expect(row).toContainText('Negotiation')
  await expect(row).toContainText('75%')
})

test('dropping a card in Won sets its close date to today', async ({ page, request }) => {
  await page.goto('/pipeline')
  const target = (await column(page, 'Won').boundingBox())!
  await drag(page, card(page, 'Route optimization'), { x: target.x + target.width / 2, y: target.y + 30 })
  await expect.poll(async () => (await dealNamed(request, 'Route optimization')).stage).toBe('Won')
  const deal = await dealNamed(request, 'Route optimization')
  expect([deal.close_date, deal.probability]).toEqual([TODAY, 100])
  await expect(card(page, 'Route optimization')).toContainText(shortToday())
})

test('a card dropped lower in its own column stays where it was shown, after a refresh', async ({ page, request }) => {
  await page.goto('/pipeline')
  expect(await columnNames(request, 'Qualified')).toEqual(['Loyalty program', 'Warehouse analytics', 'Supplier portal', 'Patient portal refresh', 'Treasury dashboard'])
  const shownOrder = () =>
    column(page, 'Qualified').locator('article').evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label')!.split(',')[0]))

  // Drag the first card down over the third. The cards it passes slide up, and it lands in the gap shown.
  const third = (await card(page, 'Supplier portal').boundingBox())!
  await drag(page, card(page, 'Loyalty program'), { x: third.x + third.width / 2, y: third.y + third.height / 2 + 10 })
  await expect.poll(async () => (await columnNames(request, 'Qualified')).indexOf('Loyalty program')).toBeGreaterThan(1)

  const saved = await columnNames(request, 'Qualified')
  expect(await shownOrder()).toEqual(saved) // the board shows exactly what was saved (R40)
  await page.reload()
  await expect(column(page, 'Qualified').locator('article')).toHaveCount(5)
  expect(await shownOrder()).toEqual(saved) // and it's still there after a refresh
})
