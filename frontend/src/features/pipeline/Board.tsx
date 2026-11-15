import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StageBadge } from '../../components/StageBadge'
import { money } from '../../format'
import { isOpenStage, STAGE_NAMES, type Deal, type StageName } from '../deals/api'
import { CardBody, DealCard } from './DealCard'
import styles from './Pipeline.module.css'
import { columnTotals, groupByStage, placeDeals, type Columns } from './totals'

type Props = {
  deals: Deal[]
  search: string
  probabilityOf: (stage: StageName) => number
  /** Called once a card is dropped somewhere new: its stage and its index in that column (R40). */
  onMove: (deal: Deal, stage: StageName, index: number) => void
  onAdd: (stage: StageName) => void
  /** The deals as placed on the board right now, so totals follow a card while it's dragged (R43). */
  onPlacedChange: (placed: Deal[]) => void
}

const isStage = (id: UniqueIdentifier): id is StageName => typeof id === 'string' && (STAGE_NAMES as readonly string[]).includes(id)

/** Six columns in R13's order; drag with the mouse, or Space and the arrow keys (R39–R41). */
export function Board({ deals, search, probabilityOf, onMove, onAdd, onPlacedChange }: Props) {
  const [columns, setColumns] = useState<Columns>(() => groupByStage(deals))
  const [activeId, setActiveId] = useState<number | null>(null)
  const origin = useRef<{ stage: StageName; index: number } | null>(null)

  // Between drags, the board follows the saved (or optimistic) order.
  useEffect(() => {
    if (activeId === null) setColumns(groupByStage(deals))
  }, [deals, activeId])

  const placed = useMemo(() => placeDeals(deals, columns, probabilityOf), [deals, columns, probabilityOf])
  useEffect(() => onPlacedChange(placed), [placed, onPlacedChange])
  const byId = useMemo(() => new Map(placed.map((d) => [d.id, d])), [placed])

  const query = search.trim().toLowerCase()
  const matches = (d: Deal) =>
    !query || [d.name, d.organization_name, d.contact_name ?? ''].some((text) => text.toLowerCase().includes(query))

  // The keyboard getter is created once by dnd-kit, so it reads the latest columns through a ref.
  const columnsRef = useRef(columns)
  columnsRef.current = columns

  /**
   * R41: arrow keys follow the board, not pixel geometry. Left and Right go to the neighbouring
   * stage at the same row; Up and Down move one place within the column.
   */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const { active, over, droppableRects } = context
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[event.code]
    if (!active || step === undefined) return undefined
    event.preventDefault()
    const cols = columnsRef.current
    const id = Number(active.id)
    const stage = STAGE_NAMES.find((s) => cols[s].includes(id))
    if (!stage) return undefined
    const list = cols[stage]
    // Where the card is shown now: sortable moves it visually without changing `columns` until it's dropped.
    const overInColumn = over && !isStage(over.id) && list.includes(Number(over.id))
    const shownAt = overInColumn ? list.indexOf(Number(over!.id)) : list.indexOf(id)
    const rectOf = (key: UniqueIdentifier) => droppableRects.get(key)

    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      const target = list[shownAt + step]
      const rect = target === undefined ? undefined : rectOf(target)
      return rect ? { x: rect.left, y: rect.top } : undefined
    }
    const next = STAGE_NAMES[STAGE_NAMES.indexOf(stage) + step]
    if (!next) return undefined
    const targetList = cols[next]
    if (shownAt < targetList.length) {
      const rect = rectOf(targetList[shownAt])
      return rect ? { x: rect.left, y: rect.top } : undefined
    }
    if (targetList.length) {
      // Past the end of a shorter column: just below the middle of its last card, so it lands after it.
      const rect = rectOf(targetList[targetList.length - 1])
      return rect ? { x: rect.left, y: rect.top + rect.height / 2 + 1 } : undefined
    }
    const rect = rectOf(next)
    return rect ? { x: rect.left, y: rect.top } : undefined
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )

  const containerOf = (id: UniqueIdentifier): StageName | undefined =>
    isStage(id) ? id : STAGE_NAMES.find((s) => columns[s].includes(Number(id)))

  function onDragStart({ active }: DragStartEvent) {
    const stage = containerOf(active.id)!
    origin.current = { stage, index: columns[stage].indexOf(Number(active.id)) }
    setActiveId(Number(active.id))
  }

  // Moving over another column puts the card into it, where the pointer or keyboard is (R40).
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const from = containerOf(active.id)
    const to = containerOf(over.id)
    if (!from || !to || from === to) return
    setColumns((current) => {
      const target = current[to]
      const overIndex = isStage(over.id) ? target.length : target.indexOf(Number(over.id))
      const below =
        !isStage(over.id) && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2
      const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0)
      return {
        ...current,
        [from]: current[from].filter((id) => id !== Number(active.id)),
        [to]: [...target.slice(0, index), Number(active.id), ...target.slice(index)],
      }
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = Number(active.id)
    const stage = containerOf(active.id)
    let final = columns
    if (over && stage) {
      const list = columns[stage]
      const from = list.indexOf(id)
      const to = isStage(over.id) ? list.length - 1 : list.indexOf(Number(over.id))
      if (to >= 0 && from !== to) {
        final = { ...columns, [stage]: arrayMove(list, from, to) }
        setColumns(final)
      }
    }
    const start = origin.current
    setActiveId(null)
    origin.current = null
    if (!stage || !start) return
    const index = final[stage].indexOf(id)
    if (stage !== start.stage || index !== start.index) onMove(byId.get(id) ?? deals.find((d) => d.id === id)!, stage, index)
  }

  function onDragCancel() {
    setActiveId(null)
    origin.current = null
    setColumns(groupByStage(deals))
  }

  const nameOf = (id: UniqueIdentifier) => byId.get(Number(id))?.name ?? 'Deal'
  /** "Proposal, position 3 of 5", as shown: within a column, sortable moves the card visually first. */
  const where = (id: UniqueIdentifier, overId?: UniqueIdentifier | null) => {
    const stage = containerOf(id)
    if (!stage) return ''
    const list = columns[stage]
    const shown = overId != null && !isStage(overId) && list.includes(Number(overId)) ? list.indexOf(Number(overId)) : list.indexOf(Number(id))
    return `${stage}, position ${shown + 1} of ${list.length}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)} in ${where(active.id)}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`,
    onDragOver: ({ active, over }) => `${nameOf(active.id)} is now in ${where(active.id, over?.id)}.`,
    onDragEnd: ({ active, over }) => `Dropped ${nameOf(active.id)} in ${where(active.id, over?.id)}.`,
    onDragCancel: ({ active }) => `Move cancelled. ${nameOf(active.id)} is back where it was.`,
  }

  const active = activeId === null ? undefined : byId.get(activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a deal, press Space to pick it up, use the arrow keys to move it within or between stages, then press Space to drop it or Escape to cancel. Each card also has a Move to menu.',
        },
      }}
    >
      <div className={styles.board}>
        {STAGE_NAMES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            ids={columns[stage]}
            deals={placed}
            byId={byId}
            matches={matches}
            searching={!!query}
            onAdd={onAdd}
            onMoveTo={(deal, to) => onMove(deal, to, 0)}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <article className={`${styles.card} ${styles.lifted} ${isOpenStage(active.stage) ? '' : styles.closed}`}>
            <CardBody deal={active} />
          </article>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

type ColumnProps = {
  stage: StageName
  ids: number[]
  deals: Deal[]
  byId: Map<number, Deal>
  matches: (d: Deal) => boolean
  searching: boolean
  onAdd: (stage: StageName) => void
  onMoveTo: (deal: Deal, stage: StageName) => void
}

function Column({ stage, ids, deals, byId, matches, searching, onAdd, onMoveTo }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const t = columnTotals(deals, stage)
  const open = isOpenStage(stage)
  const shown = ids.map((id) => byId.get(id)).filter((d): d is Deal => !!d && matches(d))
  const headingId = `column-${stage}`

  return (
    <section className={styles.column} aria-labelledby={headingId}>
      <div className={`panel ${styles.columnHead}`}>
        <div className={styles.columnTop}>
          <h2 id={headingId} className={styles.columnTitle}>
            <StageBadge stage={stage} />
            <span className="visually-hidden">
              {t.count} deals, {money(t.valueCents)}
              {open ? `, ${money(t.expectedCents)} expected` : ''}
            </span>
          </h2>
          <button type="button" className={`icon-btn ${styles.addCard}`} aria-label={`Add a deal to ${stage}`} onClick={() => onAdd(stage)}>
            <Plus size={15} aria-hidden />
          </button>
        </div>
        <div className={styles.columnFigures} aria-hidden>
          <div>
            <b className="mono" data-testid={`column-value-${stage}`}>
              {money(t.valueCents)}
            </b>
            <span>{t.count === 1 ? '1 deal' : `${t.count} deals`}</span>
          </div>
          <div className={styles.right}>
            {open ? (
              <>
                <b className="mono" data-testid={`column-expected-${stage}`}>
                  {money(t.expectedCents)}
                </b>
                <span>expected</span>
              </>
            ) : (
              <>
                <b>&nbsp;</b>
                <span>closed</span>
              </>
            )}
          </div>
        </div>
      </div>
      <SortableContext id={stage} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`${styles.cards} ${isOver ? styles.over : ''}`} data-stage={stage}>
          {shown.map((deal) => (
            <DealCard key={deal.id} deal={deal} dragDisabled={searching} onMoveTo={onMoveTo} />
          ))}
          {shown.length === 0 && <p className={styles.emptyColumn}>{searching ? 'No matching deals' : 'No deals'}</p>}
        </div>
      </SortableContext>
    </section>
  )
}
