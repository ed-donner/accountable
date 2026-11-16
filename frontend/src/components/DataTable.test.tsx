import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test-utils'
import { columnHelper, DataTable } from './DataTable'

type Row = { id: number; name: string; city: string | null; amount: number }
const col = columnHelper<Row>()
const columns = col.columns([
  col.accessor('name', { header: 'Name' }),
  col.accessor('city', { header: 'City', cell: (i) => i.getValue() ?? '' }),
  col.accessor('amount', { header: 'Amount', enableGlobalFilter: false }),
])
const rows: Row[] = [
  { id: 1, name: 'Bravo', city: null, amount: 30 },
  { id: 2, name: 'alpha', city: 'Leeds', amount: 10 },
  { id: 3, name: 'Charlie', city: 'Bristol', amount: 20 },
]

function setup(data: Row[] | undefined = rows) {
  const onAdd = vi.fn()
  renderApp(<DataTable data={data} columns={columns} noun="things" addLabel="New thing" onAdd={onAdd} getRowId={(r) => String(r.id)} />)
  return { onAdd, user: userEvent.setup() }
}

const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('DataTable', () => {
  it('filters any text column as you type, ignoring case (R19)', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Search things'), 'LEE')
    expect(names()).toEqual(['alpha'])
    await user.clear(screen.getByLabelText('Search things'))
    await user.type(screen.getByLabelText('Search things'), 'bravo')
    expect(names()).toEqual(['Bravo'])
  })

  it('sorts by a column and reverses on a second click, showing it in the heading (R20)', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['Charlie', 'Bravo', 'alpha'])
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: /Amount/ }))
    expect(names()).toEqual(['alpha', 'Charlie', 'Bravo'])
  })

  it('sorts a mostly-empty text column with empty values first, in a steady order (R20)', async () => {
    const textCols = col.columns([col.accessor('name', { header: 'Name' }), col.accessor('city', { header: 'City', sortFn: 'text' })])
    const many: Row[] = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: i + 10, name: `Empty ${i}`, city: null, amount: 0 })),
      { id: 1, name: 'In Leeds', city: 'Leeds', amount: 0 },
      { id: 2, name: 'In Bristol', city: 'bristol', amount: 0 },
    ]
    renderApp(<DataTable data={many} columns={textCols} noun="things" addLabel="New thing" onAdd={vi.fn()} getRowId={(r) => String(r.id)} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /City/ }))
    expect(names().slice(-2)).toEqual(['In Bristol', 'In Leeds'])
    await user.click(screen.getByRole('button', { name: /City/ }))
    expect(names().slice(0, 2)).toEqual(['In Leeds', 'In Bristol'])
  })

  it('shows a plain message and the add button when empty or nothing matches (R25)', async () => {
    const { user, onAdd } = setup()
    await user.type(screen.getByLabelText('Search things'), 'zzz')
    expect(screen.getByText('No things match “zzz”.')).toBeInTheDocument()
    const adds = screen.getAllByRole('button', { name: 'New thing' })
    expect(adds).toHaveLength(2)
    await user.click(adds[1])
    expect(onAdd).toHaveBeenCalled()
  })

  it('says when there is nothing yet', () => {
    setup([])
    expect(screen.getByText('No things yet.')).toBeInTheDocument()
  })
})
