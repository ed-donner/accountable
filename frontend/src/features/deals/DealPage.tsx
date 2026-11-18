import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LinkList, RecordLayout, Section } from '../../components/RecordLayout'
import { StageBadge } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { money, shortDate } from '../../format'
import { TimelineSection } from '../activities/TimelineSection'
import { useDeal } from './api'
import { DealForm } from './DealForm'

/** R33: details, stage, figures, close date (marked if late), organization, main contact, timeline. */
export function DealPage() {
  const id = Number(useParams().id)
  const query = useDeal(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deal = query.data

  if (query.error) return <p className="empty">This deal doesn't exist. It may have been deleted.</p>
  if (!deal) return <p className="empty">Loading…</p>

  return (
    <>
      <RecordLayout
        backTo="/deals"
        backLabel="Deals"
        title={deal.name}
        badges={
          <>
            <StageBadge stage={deal.stage} />
            {deal.is_late && <span className="late-tag">Late</span>}
          </>
        }
        facts={[
          { label: 'Value (USD)', value: <span className="mono">{money(deal.value_cents)}</span> },
          { label: 'Probability', value: <span className="mono">{deal.probability}%</span> },
          { label: 'Expected revenue (USD)', value: <span className="mono">{money(deal.expected_cents)}</span> },
          {
            label: 'Close date',
            value: <span className={`mono ${deal.is_late ? 'late' : ''}`}>{shortDate(deal.close_date)}</span>,
          },
        ]}
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setDeleting(true)}>
              Delete
            </button>
          </>
        }
        left={
          <Section title="Linked records">
            <LinkList
              empty=""
              items={[
                {
                  key: 1,
                  link: <Link to={`/organizations/${deal.organization_id}`}>{deal.organization_name}</Link>,
                  detail: 'Organization',
                },
                ...(deal.main_contact_id
                  ? [{ key: 2, link: <Link to={`/contacts/${deal.main_contact_id}`}>{deal.contact_name}</Link>, detail: 'Main contact' }]
                  : [{ key: 2, link: <span className="muted">No main contact</span>, detail: 'Main contact' }]),
              ]}
            />
          </Section>
        }
        right={
          <TimelineSection
            entries={deal.timeline}
            context={{ kind: 'deal', id: deal.id, name: deal.name, mainContactId: deal.main_contact_id }}
          />
        }
      />
      <DealForm open={editing} onOpenChange={setEditing} deal={deal} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete deal"
        previewPath={`/deals/${id}/delete-preview`}
        onConfirm={async () => {
          await api(`/deals/${id}`, 'DELETE')
          toast('Deal deleted')
          navigate('/deals')
          await refreshAll(queryClient)
        }}
      />
    </>
  )
}
