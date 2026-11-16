import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { api, ApiError, refreshAll } from '../../api'
import { PageHeader } from '../../components/PageHeader'
import { STAGE_COLOR } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { money } from '../../format'
import { useDeals, useStages, type Deal, type StageName } from '../deals/api'
import { DealForm } from '../deals/DealForm'
import { Board } from './Board'
import styles from './Pipeline.module.css'
import { applyMove, columnTotals, openTotals } from './totals'

type Move = { deal: Deal; stage: StageName; index: number }

/** The Pipeline page (R39–R44, D21). */
export function PipelinePage() {
  const deals = useDeals()
  const stages = useStages()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<StageName | null>(null)
  const [placed, setPlaced] = useState<Deal[]>([])

  const probabilityOf = useCallback(
    (stage: StageName) => stages.data?.find((s) => s.name === stage)?.probability ?? 0,
    [stages.data],
  )

  // D12: the board and its totals update at once; on failure the card goes back (R44).
  // Moves can overlap (two quick drags), so the board is always `confirmed` (the deals as last
  // saved) with every move still in flight applied on top. A failed move drops out of that list
  // without undoing the others, and the deals are refetched only once no move is in flight, so
  // a refetch can't show a later move as not yet made.
  const confirmed = useRef<Deal[] | undefined>(undefined)
  const inFlight = useRef<Move[]>([])
  const apply = (deals: Deal[], moves: Move[]) =>
    moves.reduce((d, m) => applyMove(d, m.deal.id, m.stage, m.index, probabilityOf), deals)
  const settle = (m: Move) => {
    inFlight.current = inFlight.current.filter((x) => x !== m)
  }
  const move = useMutation({
    mutationFn: ({ deal, stage, index }: Move) => api<Deal>(`/deals/${deal.id}/move`, 'POST', { stage, index }),
    onMutate: async (m: Move) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] })
      const current = queryClient.getQueryData<Deal[]>(['deals'])
      if (!current) return
      if (inFlight.current.length === 0) confirmed.current = current
      inFlight.current = [...inFlight.current, m]
      queryClient.setQueryData(['deals'], apply(current, [m]))
    },
    onError: (error, m) => {
      settle(m)
      if (confirmed.current) queryClient.setQueryData(['deals'], apply(confirmed.current, inFlight.current))
      const reason = error instanceof ApiError && error.status ? ` ${error.message}` : ''
      toast(`Couldn't move ${m.deal.name}, so it's back where it was.${reason}`, 'error')
    },
    onSuccess: (_saved, m) => {
      settle(m)
      if (confirmed.current) confirmed.current = apply(confirmed.current, [m])
      if (m.stage !== m.deal.stage) toast(`${m.deal.name} moved to ${m.stage}`)
    },
    onSettled: () => {
      if (inFlight.current.length === 0) return refreshAll(queryClient)
    },
  })

  // `mutate` is stable, unlike the mutation object, so cards that receive this don't redraw needlessly.
  const { mutate } = move
  const onMove = useCallback((deal: Deal, stage: StageName, index: number) => mutate({ deal, stage, index }), [mutate])
  const open = openTotals(placed)
  const late = placed.filter((d) => d.is_late).length
  const openStages = (stages.data ?? []).filter((s) => s.open)

  return (
    <>
      <PageHeader
        title="Pipeline"
        sub={`${open.count} open deals. Drag a card, or focus it and press Space, to move it.`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding('New')}>
            <Plus size={16} aria-hidden />
            New deal
          </button>
        }
      />
      <section className={`panel ${styles.strip}`} aria-label="Open pipeline totals">
        <div className="search">
          <Search size={16} aria-hidden />
          <label htmlFor="search-pipeline" className="visually-hidden">
            Search deals
          </label>
          <input
            id="search-pipeline"
            className="input"
            type="search"
            placeholder="Search deals"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <dl className={styles.figures}>
          <div>
            <dt>Open pipeline</dt>
            <dd className="mono" data-testid="open-value">
              {money(open.valueCents)}
            </dd>
          </div>
          <div>
            <dt>Expected revenue</dt>
            <dd className="mono" style={{ color: 'var(--sea-green-text)' }} data-testid="open-expected">
              {money(open.expectedCents)}
            </dd>
          </div>
          <div>
            <dt>Late deals</dt>
            <dd className="mono" style={{ color: late ? 'var(--raspberry-text)' : undefined }}>
              {late}
            </dd>
          </div>
        </dl>
        <div className={styles.stack}>
          <div className={styles.stackBar} aria-hidden>
            {openStages.map((s) => (
              <div key={s.name} style={{ flex: Math.max(columnTotals(placed, s.name).valueCents, 1), background: STAGE_COLOR[s.name] }} />
            ))}
          </div>
          <div className={styles.legend}>
            {openStages.map((s) => {
              const t = columnTotals(placed, s.name)
              return (
                <div key={s.name}>
                  <span className={styles.legendKey}>
                    <span className={styles.dot} style={{ background: STAGE_COLOR[s.name] }} aria-hidden />
                    {s.name} · {t.count}
                  </span>
                  <b className="mono">{money(t.valueCents)}</b>
                </div>
              )
            })}
          </div>
        </div>
      </section>
      {search && <p className={styles.searchNote}>Showing deals that match “{search}”.</p>}
      {deals.error ? (
        <p className="empty" role="alert">
          Couldn't load the pipeline. Refresh the page to try again.
        </p>
      ) : !deals.data || !stages.data ? (
        <p className="empty">Loading the pipeline…</p>
      ) : (
        <Board
          deals={deals.data}
          search={search}
          probabilityOf={probabilityOf}
          onMove={onMove}
          onAdd={setAdding}
          onPlacedChange={setPlaced}
        />
      )}
      <DealForm open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} defaultStage={adding ?? 'New'} />
    </>
  )
}
