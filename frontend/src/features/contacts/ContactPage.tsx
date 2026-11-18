import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LinkList, RecordLayout, Section } from '../../components/RecordLayout'
import { StageBadge } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { money } from '../../format'
import { TimelineSection } from '../activities/TimelineSection'
import { useContact } from './api'
import { ContactForm } from './ContactForm'
import { StatusBadge } from './StatusBadge'

/** R32: details, status, organization, their deals as main contact, and their timeline. */
export function ContactPage() {
  const id = Number(useParams().id)
  const query = useContact(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const contact = query.data

  if (query.error) return <p className="empty">This contact doesn't exist. They may have been deleted.</p>
  if (!contact) return <p className="empty">Loading…</p>

  return (
    <>
      <RecordLayout
        backTo="/contacts"
        backLabel="Contacts"
        title={contact.name}
        badges={<StatusBadge status={contact.status} />}
        facts={[
          { label: 'Job title', value: contact.job_title },
          {
            label: 'Organization',
            value: contact.organization_id ? <Link to={`/organizations/${contact.organization_id}`}>{contact.organization_name}</Link> : null,
          },
          { label: 'Email', value: contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null },
          { label: 'Phone', value: contact.phone ? <span className="mono">{contact.phone}</span> : null },
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
          <Section title="Deals" aside={<span className="muted">As main contact</span>}>
            <LinkList
              empty="No deals with this contact as main contact."
              items={contact.deals.map((d) => ({
                key: d.id,
                link: <Link to={`/deals/${d.id}`}>{d.name}</Link>,
                detail: d.organization_name,
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
        right={
          <TimelineSection
            entries={contact.timeline}
            context={{ kind: 'contact', id: contact.id, name: contact.name, deals: contact.deals }}
          />
        }
      />
      <ContactForm open={editing} onOpenChange={setEditing} contact={contact} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete contact"
        previewPath={`/contacts/${id}/delete-preview`}
        onConfirm={async () => {
          await api(`/contacts/${id}`, 'DELETE')
          toast('Contact deleted')
          navigate('/contacts')
          await refreshAll(queryClient)
        }}
      />
    </>
  )
}
