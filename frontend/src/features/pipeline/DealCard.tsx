import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { RowMenu } from '../../components/RowMenu'
import { STAGE_COLOR } from '../../components/StageBadge'
import { money, shortDate } from '../../format'
import { isOpenStage, STAGE_NAMES, type Deal, type StageName } from '../deals/api'
import styles from './Pipeline.module.css'

type Props = {
  deal: Deal
  /** Dragging is off while the board is filtered by search, since positions would be ambiguous. */
  dragDisabled: boolean
  onMoveTo: (deal: Deal, stage: StageName) => void
}

/** A card: name, organization · contact, probability, value and close date (D21). */
export const DealCard = memo(function DealCard({ deal, dragDisabled, onMoveTo }: Props) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    disabled: dragDisabled,
  })
  const open = isOpenStage(deal.stage)

  // Space picks up the card only when the card itself has focus, not its link or menu (R41).
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) listeners?.onKeyDown?.(e)
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.card} ${open ? '' : styles.closed} ${isDragging ? styles.placeholder : ''}`}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-label={`${deal.name}, ${deal.organization_name}, ${money(deal.value_cents)}, ${deal.stage}${deal.is_late ? ', late' : ''}`}
      aria-roledescription="deal card"
      data-deal-id={deal.id}
    >
      <CardBody deal={deal} />
      <div className={styles.cardMenu}>
        <RowMenu
          label={`Actions for ${deal.name}`}
          heading="Move to…"
          items={[
            ...STAGE_NAMES.filter((s) => s !== deal.stage).map((s) => ({
              label: s,
              onSelect: () => onMoveTo(deal, s),
              icon: <span className={styles.dot} style={{ background: STAGE_COLOR[s] }} aria-hidden />,
            })),
            { label: 'Open deal', onSelect: () => navigate(`/deals/${deal.id}`) },
          ]}
        />
      </div>
    </article>
  )
})

/** The card's contents, shared with the lifted copy shown while dragging. */
export function CardBody({ deal }: { deal: Deal }) {
  const open = isOpenStage(deal.stage)
  return (
    <>
      <div className={styles.cardTop}>
        <Link to={`/deals/${deal.id}`} className={styles.cardName} tabIndex={-1} draggable={false}>
          {deal.name}
        </Link>
        {deal.is_late && <span className="late-tag">Late</span>}
      </div>
      <div className={styles.cardOrg}>
        {deal.organization_name}
        {deal.contact_name && ` · ${deal.contact_name}`}
      </div>
      {open && (
        <div className={styles.prob} aria-hidden>
          <div className={styles.track}>
            <div style={{ width: `${deal.probability}%`, background: STAGE_COLOR[deal.stage] }} />
          </div>
          {deal.probability}%
        </div>
      )}
      <div className={styles.cardFoot}>
        <b className="mono">{money(deal.value_cents)}</b>
        <span className={`mono ${deal.is_late ? 'late' : styles.date}`}>{shortDate(deal.close_date)}</span>
      </div>
    </>
  )
}
