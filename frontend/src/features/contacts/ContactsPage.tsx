import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { columnHelper, DataTable } from '../../components/DataTable'
import { PageHeader } from '../../components/PageHeader'
import { RowMenu } from '../../components/RowMenu'
import { useToast } from '../../components/Toast'
import { STATUSES, STATUS_LABELS, useContacts, type Contact, type Status } from './api'
import { ContactForm } from './ContactForm'
import { StatusBadge } from './StatusBadge'

type Actions = { edit: (c: Contact) => void; remove: (c: Contact) => void }

const col = columnHelper<Contact>()
const makeColumns = (actions: Actions) =>
  col.columns([
    col.accessor('name', { header: 'Name', cell: (info) => <Link to={`/contacts/${info.row.original.id}`}>{info.getValue()}</Link> }),
    col.accessor((c) => STATUS_LABELS[c.status], { id: 'status', header: 'Status', cell: (info) => <StatusBadge status={info.row.original.status} /> }),
    col.accessor('job_title', { header: 'Job title', cell: (info) => info.getValue() ?? '' }),
    col.accessor('organization_name', {
      header: 'Organization',
      cell: (info) =>
        info.row.original.organization_id ? <Link to={`/organizations/${info.row.original.organization_id}`}>{info.getValue()}</Link> : '',
    }),
    col.accessor('email', { header: 'Email', cell: (info) => info.getValue() ?? '' }),
    col.accessor('phone', { header: 'Phone', cell: (info) => <span className="mono">{info.getValue() ?? ''}</span> }),
    col.display({
      id: 'actions',
      header: () => <span className="visually-hidden">Actions</span>,
      cell: (info) => (
        <RowMenu
          label={`Actions for ${info.row.original.name}`}
          items={[
            { label: 'Edit', onSelect: () => actions.edit(info.row.original) },
            { label: 'Delete', danger: true, onSelect: () => actions.remove(info.row.original) },
          ]}
        />
      ),
    }),
  ])

export function ContactsPage() {
  const query = useContacts()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Contact | null>(null)
  const [columns] = useState(() => makeColumns({ edit: setEditing, remove: setDeleting }))
  const data = useMemo(
    () => (status === 'all' ? query.data : query.data?.filter((c) => c.status === status)),
    [query.data, status],
  )

  return (
    <>
      <PageHeader title="Contacts" sub="Leads, qualified contacts and customers" />
      <DataTable
        data={data}
        error={query.error}
        columns={columns}
        noun="contacts"
        addLabel="New contact"
        onAdd={() => setEditing('new')}
        getRowId={(c) => String(c.id)}
        toolbar={
          <div role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 4 }}>
            {(['all', ...STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`btn btn-small ${status === s ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        }
      />
      <ContactForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        contact={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete contact"
        previewPath={deleting ? `/contacts/${deleting.id}/delete-preview` : undefined}
        onConfirm={async () => {
          await api(`/contacts/${deleting!.id}`, 'DELETE')
          await refreshAll(queryClient)
          toast('Contact deleted')
        }}
      />
    </>
  )
}
