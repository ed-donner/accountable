import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { columnHelper, DataTable } from '../../components/DataTable'
import { PageHeader } from '../../components/PageHeader'
import { RowMenu } from '../../components/RowMenu'
import { useToast } from '../../components/Toast'
import { money } from '../../format'
import { useOrganizations, type Organization } from './api'
import { OrganizationForm } from './OrganizationForm'

type Actions = { edit: (o: Organization) => void; remove: (o: Organization) => void }

const col = columnHelper<Organization>()
const makeColumns = (actions: Actions) =>
  col.columns([
    col.accessor('name', {
      header: 'Name',
      cell: (info) => <Link to={`/organizations/${info.row.original.id}`}>{info.getValue()}</Link>,
    }),
    col.accessor('industry', { header: 'Industry', cell: (info) => info.getValue() ?? '' }),
    col.accessor('website', {
      header: 'Website',
      cell: (info) => (info.getValue() ? <span className="muted">{info.getValue()!.replace(/^https?:\/\//, '')}</span> : ''),
    }),
    col.accessor('contact_count', { header: 'Contacts', enableGlobalFilter: false, meta: { align: 'right' }, cell: (info) => <span className="mono">{info.getValue()}</span> }),
    col.accessor('open_deal_value_cents', {
      header: 'Open deals (USD)',
      enableGlobalFilter: false,
      meta: { align: 'right' },
      cell: (info) => <span className="mono">{money(info.getValue())}</span>,
    }),
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

export function OrganizationsPage() {
  const query = useOrganizations()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Organization | null>(null)
  const [columns] = useState(() => makeColumns({ edit: setEditing, remove: setDeleting }))

  return (
    <>
      <PageHeader title="Organizations" sub="The companies you do business with" />
      <DataTable
        data={query.data}
        error={query.error}
        columns={columns}
        noun="organizations"
        addLabel="New organization"
        onAdd={() => setEditing('new')}
        getRowId={(o) => String(o.id)}
      />
      <OrganizationForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        organization={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete organization"
        previewPath={deleting ? `/organizations/${deleting.id}/delete-preview` : undefined}
        onConfirm={async () => {
          await api(`/organizations/${deleting!.id}`, 'DELETE')
          await refreshAll(queryClient)
          toast('Organization deleted')
        }}
      />
    </>
  )
}
