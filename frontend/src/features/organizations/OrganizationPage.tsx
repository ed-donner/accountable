import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LinkList, RecordLayout, Section } from '../../components/RecordLayout'
import { StageBadge } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { money } from '../../format'
import { STATUS_LABELS } from '../contacts/api'
import { useOrganization } from './api'
import { OrganizationForm } from './OrganizationForm'

/** R31: details, Edit, its contacts and deals, and the total value of its open deals. */
export function OrganizationPage() {
  const id = Number(useParams().id)
  const query = useOrganization(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const org = query.data

  if (query.error) return <p className="empty">This organization doesn't exist. It may have been deleted.</p>
  if (!org) return <p className="empty">Loading…</p>

  return (
    <>
      <RecordLayout
        backTo="/organizations"
        backLabel="Organizations"
        title={org.name}
        facts={[
          { label: 'Industry', value: org.industry },
          {
            label: 'Website',
            value: org.website ? (
              <a href={org.website} target="_blank" rel="noreferrer">
                {org.website.replace(/^https?:\/\//, '')}
              </a>
            ) : null,
          },
          { label: 'Open deals (USD)', value: <span className="mono">{money(org.open_deal_value_cents)}</span> },
          { label: 'Notes', value: org.notes },
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
          <Section title="Contacts" aside={<span className="muted">{org.contacts.length}</span>}>
            <LinkList
              empty="No contacts yet."
              items={org.contacts.map((c) => ({
                key: c.id,
                link: <Link to={`/contacts/${c.id}`}>{c.name}</Link>,
                detail: c.job_title,
                extra: <span className="muted">{STATUS_LABELS[c.status]}</span>,
              }))}
            />
          </Section>
        }
        right={
          <Section title="Deals" aside={<span className="muted">{org.deals.length}</span>}>
            <LinkList
              empty="No deals yet."
              items={org.deals.map((d) => ({
                key: d.id,
                link: <Link to={`/deals/${d.id}`}>{d.name}</Link>,
                detail: d.contact_name,
                extra: (
                  <>
                    <StageBadge stage={d.stage} />
                    <span className="mono">{money(d.value_cents)}</span>
                  </>
                ),
              }))}
            />
          </Section>
        }
      />
      <OrganizationForm open={editing} onOpenChange={setEditing} organization={org} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete organization"
        previewPath={`/organizations/${id}/delete-preview`}
        onConfirm={async () => {
          await api(`/organizations/${id}`, 'DELETE')
          toast('Organization deleted')
          navigate('/organizations')
          await refreshAll(queryClient)
        }}
      />
    </>
  )
}
