import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, errorMessage, refreshAll } from '../../api'
import { Drawer } from '../../components/Drawer'
import { Field, fieldProps, longTextField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { toLocalInput } from '../../format'
import { useContacts } from '../contacts/api'
import { ENTERED_KINDS, KIND_LABELS, saveActivity, type Activity } from './api'

/** Where the activity is logged from, and what it can also be linked to (R35). */
export type TimelineContext =
  | { kind: 'contact'; id: number; name: string; deals: { id: number; name: string }[] }
  | { kind: 'deal'; id: number; name: string; mainContactId: number | null }

const schema = z.object({
  kind: z.enum(ENTERED_KINDS),
  description: longTextField('Describe what happened'),
  occurred_at: z.string().min(1, 'Enter when it happened'),
  follow_up_date: z.string(),
  other_id: z.string(),
})
type Values = z.infer<typeof schema>

type Props = { open: boolean; onOpenChange: (open: boolean) => void; context: TimelineContext; activity?: Activity }

/** Log or edit a note, call or email, with an optional follow-up date (R35, R37, D13). */
export function ActivityForm({ open, onOpenChange, context, activity }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const contacts = useContacts()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (!open) return
    const other = context.kind === 'contact' ? activity?.deal_id : activity ? activity.contact_id : context.mainContactId
    form.reset({
      kind: activity && activity.kind !== 'stage_change' ? activity.kind : 'note',
      description: activity?.description ?? '',
      occurred_at: toLocalInput(activity?.occurred_at ?? new Date()),
      follow_up_date: activity?.follow_up_date ?? '',
      other_id: other ? String(other) : '',
    })
  }, [open, activity, context, form])

  // From a deal, any contact can be named, with the main contact suggested first (R35).
  const contactOptions =
    context.kind === 'deal'
      ? [...(contacts.data ?? [])].sort((a, b) => Number(b.id === context.mainContactId) - Number(a.id === context.mainContactId))
      : []

  // From a contact, their deals; plus the activity's current deal, so editing never drops the link.
  const dealOptions =
    context.kind === 'contact'
      ? activity?.deal_id && !context.deals.some((d) => d.id === activity.deal_id)
        ? [...context.deals, { id: activity.deal_id, name: activity.deal_name ?? 'Linked deal' }]
        : context.deals
      : []

  async function submit(v: Values) {
    const other = v.other_id ? Number(v.other_id) : null
    try {
      await saveActivity(
        {
          kind: v.kind,
          description: v.description,
          occurred_at: new Date(v.occurred_at).toISOString(),
          follow_up_date: v.follow_up_date || null,
          contact_id: context.kind === 'contact' ? context.id : other,
          deal_id: context.kind === 'deal' ? context.id : other,
        },
        activity?.id,
      )
      await refreshAll(queryClient)
      toast(activity ? 'Activity saved' : 'Activity logged')
      onOpenChange(false)
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {}
      Object.entries(fields).forEach(([name, message]) =>
        form.setError((name === 'contact_id' || name === 'deal_id' ? 'other_id' : name) as keyof Values, { message }),
      )
      if (!Object.keys(fields).length) form.setError('root', { message: errorMessage(e) })
    }
  }

  return (
    <Drawer
      centered
      open={open}
      onOpenChange={onOpenChange}
      title={activity ? 'Edit activity' : 'Log activity'}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="activity-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : activity ? 'Save activity' : 'Log activity'}
          </button>
        </>
      }
    >
      <form id="activity-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field id="activity-kind" label="Type">
          <select className="select" {...fieldProps('activity-kind')} {...form.register('kind')}>
            {ENTERED_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="activity-description" label="Description" error={errors.description?.message}>
          <textarea className="textarea" {...fieldProps('activity-description', errors.description?.message)} {...form.register('description')} />
        </Field>
        <Field id="activity-when" label="When it happened" error={errors.occurred_at?.message}>
          <input className="input" type="datetime-local" {...fieldProps('activity-when', errors.occurred_at?.message)} {...form.register('occurred_at')} />
        </Field>
        <Field id="activity-follow-up" label="Follow-up date" hint="(optional)">
          <input className="input" type="date" {...fieldProps('activity-follow-up')} {...form.register('follow_up_date')} />
        </Field>
        {context.kind === 'contact' ? (
          <Field id="activity-other" label="Deal" hint="(optional)" error={errors.other_id?.message}>
            <select className="select" {...fieldProps('activity-other', errors.other_id?.message)} {...form.register('other_id')}>
              <option value="">No deal</option>
              {dealOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field id="activity-other" label="Contact" hint="(optional)" error={errors.other_id?.message}>
            {/* Rendered once the contacts exist, so the suggested main contact is selected. */}
            {contacts.data ? (
              <select className="select" {...fieldProps('activity-other', errors.other_id?.message)} {...form.register('other_id')}>
                <option value="">No contact</option>
                {contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.id === context.mainContactId ? ' (main contact)' : c.organization_name ? `, ${c.organization_name}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <select id="activity-other" className="select" disabled>
                <option>Loading…</option>
              </select>
            )}
          </Field>
        )}
        {errors.root && (
          <p className="late" role="alert">
            {errors.root.message}
          </p>
        )}
      </form>
    </Drawer>
  )
}
