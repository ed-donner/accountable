import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { api, refreshAll } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Section } from '../../components/RecordLayout'
import { useToast } from '../../components/Toast'
import { ActivityForm, type TimelineContext } from './ActivityForm'
import { KIND_LABELS, useSetDone, type Activity } from './api'
import { Timeline } from './Timeline'

/** The timeline panel on a contact or deal page, with Log activity (R34–R37). */
export function TimelineSection({ entries, context }: { entries: Activity[]; context: TimelineContext }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Activity | null>(null)

  const toggleDone = useSetDone()

  return (
    <Section
      title="Timeline"
      aside={
        <button type="button" className="btn btn-primary btn-small" onClick={() => setEditing('new')}>
          <Plus size={15} aria-hidden />
          Log activity
        </button>
      }
    >
      <Timeline
        entries={entries}
        showLinkTo={context.kind === 'contact' ? 'deal' : 'contact'}
        onEdit={setEditing}
        onDelete={setDeleting}
        onToggleDone={toggleDone}
      />
      <ActivityForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        context={context}
        activity={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting ? KIND_LABELS[deleting.kind].toLowerCase() : 'activity'}`}
        message="This removes it from every timeline it appears in."
        onConfirm={async () => {
          await api(`/activities/${deleting!.id}`, 'DELETE')
          await refreshAll(queryClient)
          toast('Activity deleted')
        }}
      />
    </Section>
  )
}
