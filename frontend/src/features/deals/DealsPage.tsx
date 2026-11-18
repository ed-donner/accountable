import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { columnHelper, DataTable } from '../../components/DataTable'
import { PageHeader } from '../../components/PageHeader'
import { RowMenu } from '../../components/RowMenu'
import { StageBadge } from '../../components/StageBadge'
import { useToast } from '../../components/Toast'
import { money, shortDate } from '../../format'
import { STAGE_NAMES, useDeals, type Deal } from './api'
import { DealForm } from './DealForm'

type Actions = { edit: (d: Deal) => void; remove: (d: Deal) => void }

const col = columnHelper<Deal>()
const makeColumns = (actions: Actions) =>
  col.columns([
    col.accessor('name', { header: 'Name', cell: (info) => <Link to={`/deals/${info.row.original.id}`}>{info.getValue()}</Link> }),
    col.accessor('organization_name', {
      header: 'Organization',
      cell: (info) => <Link to={`/organizations/${info.row.original.organization_id}`}>{info.getValue()}</Link>,
    }),
    col.accessor('stage', {
      header: 'Stage',
      // Sort in pipeline order, not alphabetically.
      sortFn: (a, b) => STAGE_NAMES.indexOf(a.original.stage) - STAGE_NAMES.indexOf(b.original.stage),
      cell: (info) => <StageBadge stage={info.getValue()} />,
    }),
    col.accessor('value_cents', {
      header: 'Value (USD)',
      enableGlobalFilter: false,
      meta: { align: 'right' },
      cell: (info) => <span className="mono">{money(info.getValue())}</span>,
    }),
    col.accessor('probability', {
      header: 'Probability',
      enableGlobalFilter: false,
      meta: { align: 'right' },
      cell: (info) => <span className="mono">{info.getValue()}%</span>,
    }),
    col.accessor('expected_cents', {
      header: 'Expected (USD)',
      enableGlobalFilter: false,
      meta: { align: 'right' },
      cell: (info) => <span className="mono">{money(info.getValue())}</span>,
    }),
    col.accessor('close_date', {
      header: 'Close date',
      enableGlobalFilter: false,
      cell: (info) =>
        info.row.original.is_late ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span className="mono late">{shortDate(info.getValue())}</span>
            <span className="late-tag">Late</span>
          </span>
        ) : (
          <span className="mono">{shortDate(info.getValue())}</span>
        ),
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

export function DealsPage() {
  const query = useDeals()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Deal | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Deal | null>(null)
  const [columns] = useState(() => makeColumns({ edit: setEditing, remove: setDeleting }))

  return (
    <>
      <PageHeader title="Deals" sub="Potential sales, with their stage, value and close date" />
      <DataTable
        data={query.data}
        error={query.error}
        columns={columns}
        noun="deals"
        addLabel="New deal"
        onAdd={() => setEditing('new')}
        getRowId={(d) => String(d.id)}
        initialSort={[{ id: 'name', desc: false }]}
      />
      <DealForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        deal={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete deal"
        previewPath={deleting ? `/deals/${deleting.id}/delete-preview` : undefined}
        onConfirm={async () => {
          await api(`/deals/${deleting!.id}`, 'DELETE')
          await refreshAll(queryClient)
          toast('Deal deleted')
        }}
      />
    </>
  )
}
