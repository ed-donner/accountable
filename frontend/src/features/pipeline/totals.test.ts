import { describe, expect, it } from 'vitest'
import type { Deal, StageName } from '../deals/api'
import { applyMove, columnTotals, expectedCents, groupByStage, openTotals } from './totals'

const PROB: Record<StageName, number> = { New: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 }
const probabilityOf = (s: StageName) => PROB[s]

function deal(id: number, stage: StageName, value: number, position: number, probability = PROB[stage]): Deal {
  return {
    id, name: `D${id}`, organization_id: 1, organization_name: 'Acme', main_contact_id: null, contact_name: null,
    stage, value_cents: value, probability, expected_cents: expectedCents(value, probability), close_date: '2026-12-01',
    is_late: false, position,
  }
}

const deals = [deal(1, 'New', 1000, 0), deal(2, 'New', 2000, 1), deal(3, 'Proposal', 4000, 0, 33), deal(4, 'Won', 9000, 0)]

describe('pipeline totals (R43, D12)', () => {
  it('rounds expected revenue half up, like the server (R18)', () => {
    expect(expectedCents(1, 50)).toBe(1)
    expect(expectedCents(333, 75)).toBe(250)
  })

  it('adds up open deals only for the board header', () => {
    expect(openTotals(deals)).toEqual({ count: 3, valueCents: 7000, expectedCents: 100 + 200 + 1320 })
  })

  it('moves a card to another column, taking that stage’s probability (R15)', () => {
    const moved = applyMove(deals, 1, 'Proposal', 1, probabilityOf)
    expect(groupByStage(moved).New).toEqual([2])
    expect(groupByStage(moved).Proposal).toEqual([3, 1])
    const card = moved.find((d) => d.id === 1)!
    expect([card.stage, card.probability, card.expected_cents]).toEqual(['Proposal', 50, 500])
    expect(columnTotals(moved, 'Proposal')).toEqual({ count: 2, valueCents: 5000, expectedCents: 1320 + 500 })
    expect(openTotals(moved).expectedCents).toBe(200 + 1320 + 500)
  })

  it('reorders within a column and keeps a hand-set probability (R15, R40)', () => {
    const moved = applyMove(deals, 1, 'New', 5, probabilityOf)
    expect(groupByStage(moved).New).toEqual([2, 1])
    const kept = applyMove(deals, 3, 'Proposal', 0, probabilityOf).find((d) => d.id === 3)!
    expect(kept.probability).toBe(33)
  })

  it('gives a card moved into Won or Lost today\'s close date, and works out Late when it reopens (R16, R17)', () => {
    const won = applyMove(deals, 2, 'Won', 0, probabilityOf, '2027-01-10').find((d) => d.id === 2)!
    expect([won.close_date, won.is_late]).toEqual(['2027-01-10', false])
    const reopened = applyMove(deals, 4, 'New', 0, probabilityOf, '2027-01-10').find((d) => d.id === 4)!
    expect([reopened.close_date, reopened.is_late]).toEqual(['2026-12-01', true])
    const notLate = applyMove(deals, 4, 'New', 0, probabilityOf, '2026-11-15').find((d) => d.id === 4)!
    expect(notLate.is_late).toBe(false)
  })

  it('takes a card out of the open totals when it moves to Won', () => {
    const moved = applyMove(deals, 2, 'Won', 0, probabilityOf)
    expect(openTotals(moved).count).toBe(2)
    expect(columnTotals(moved, 'Won').valueCents).toBe(11000)
  })
})
