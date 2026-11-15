import { isOpenStage, STAGE_NAMES, type Deal, type StageName } from '../deals/api'

export type Columns = Record<StageName, number[]>

/** R18: value × probability ÷ 100, rounded half up to whole cents, as on the server. */
export const expectedCents = (valueCents: number, probability: number) => Math.floor((valueCents * probability + 50) / 100)

/** Deal ids per stage, in their saved order. */
export function groupByStage(deals: Deal[]): Columns {
  const columns = Object.fromEntries(STAGE_NAMES.map((s) => [s, [] as number[]])) as Columns
  for (const d of [...deals].sort((a, b) => a.position - b.position || a.id - b.id)) columns[d.stage].push(d.id)
  return columns
}

/**
 * The deals as the board shows them: each in the column it sits in now (which may differ from
 * its saved stage while it's being dragged), with the probability that stage gives it (R15).
 */
export function placeDeals(deals: Deal[], columns: Columns, probabilityOf: (s: StageName) => number): Deal[] {
  const byId = new Map(deals.map((d) => [d.id, d]))
  const placed: Deal[] = []
  for (const stage of STAGE_NAMES) {
    columns[stage].forEach((id, position) => {
      const deal = byId.get(id)
      if (!deal) return
      if (deal.stage === stage) {
        // Unchanged deals keep the same object, so their cards can skip redrawing (R56).
        placed.push(deal.position === position ? deal : { ...deal, position })
        return
      }
      const probability = probabilityOf(stage)
      placed.push({
        ...deal,
        stage,
        position,
        probability,
        expected_cents: expectedCents(deal.value_cents, probability),
        is_late: isOpenStage(stage) ? deal.is_late : false,
      })
    })
  }
  return placed
}

/** D12: the deals after moving one to `index` in `stage`, for the optimistic update. */
export function applyMove(deals: Deal[], id: number, stage: StageName, index: number, probabilityOf: (s: StageName) => number): Deal[] {
  const columns = groupByStage(deals)
  for (const s of STAGE_NAMES) columns[s] = columns[s].filter((x) => x !== id)
  const target = columns[stage]
  target.splice(Math.min(index, target.length), 0, id)
  return placeDeals(deals, columns, probabilityOf)
}

export type Totals = { count: number; valueCents: number; expectedCents: number }

/** R43: count, total value and expected revenue of some deals. */
export function totals(deals: Deal[]): Totals {
  return deals.reduce(
    (t, d) => ({ count: t.count + 1, valueCents: t.valueCents + d.value_cents, expectedCents: t.expectedCents + d.expected_cents }),
    { count: 0, valueCents: 0, expectedCents: 0 },
  )
}

export const openTotals = (deals: Deal[]) => totals(deals.filter((d) => isOpenStage(d.stage)))
export const columnTotals = (deals: Deal[], stage: StageName) => totals(deals.filter((d) => d.stage === stage))
