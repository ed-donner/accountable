import { describe, expect, it } from 'vitest'
import { dollarsToCents, dueText, money, moneyAxis, relativeTime, shortDate } from './format'

describe('money (spec 2.8, rule 9)', () => {
  it('always shows the currency, with cents only when there are some', () => {
    expect(money(1_250_000)).toBe('$12,500')
    expect(money(0)).toBe('$0')
    expect(money(1_250_050)).toBe('$12,500.50')
  })
  it('uses the short form only for chart axes', () => {
    expect(moneyAxis(120_000_000)).toBe('$1.2M')
    expect(moneyAxis(3_000_000)).toBe('$30K')
    expect(moneyAxis(0)).toBe('$0')
  })
  it('turns typed dollars into whole cents (D4)', () => {
    expect(dollarsToCents(12.345)).toBe(1235)
    expect(dollarsToCents(0.1 + 0.2)).toBe(30)
  })
})

describe('dates (D20)', () => {
  const now = new Date(2026, 10, 15, 12, 0)
  it('shows the year only when it is not this year', () => {
    expect(shortDate('2026-11-18', now)).toBe('Nov 18')
    expect(shortDate('2027-01-20', now)).toBe('Jan 20, 2027')
  })
  it('says today and yesterday', () => {
    expect(relativeTime(new Date(2026, 10, 15, 9, 42).toISOString(), now)).toBe('Today, 9:42 AM')
    expect(relativeTime(new Date(2026, 10, 14, 16, 15).toISOString(), now)).toBe('Yesterday, 4:15 PM')
    expect(relativeTime(new Date(2026, 10, 7, 14, 30).toISOString(), now)).toBe('Nov 7, 2:30 PM')
  })
  it('describes follow-up dates against the server today (R38)', () => {
    expect(dueText('2026-11-15', '2026-11-11')).toBe('4 days overdue')
    expect(dueText('2026-11-15', '2026-11-14')).toBe('1 day overdue')
    expect(dueText('2026-11-15', '2026-11-15')).toBe('Today')
    expect(dueText('2026-11-15', '2026-11-18')).toBe('In 3 days')
  })
})
