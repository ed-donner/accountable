import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, errorMessage, refreshAll } from '../../api'
import { Drawer } from '../../components/Drawer'
import { Field, fieldProps, nameField, textField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { useOrganizations } from '../organizations/api'
import { saveContact, STATUSES, STATUS_LABELS, type Contact } from './api'

const schema = z.object({
  name: nameField('Enter a name'),
  job_title: textField(),
  organization_id: z.string(),
  status: z.enum(STATUSES),
  email: z.union([z.literal(''), z.email('Enter an email address like name@example.com')]),
  phone: textField(),
})
type Values = z.infer<typeof schema>

type Props = { open: boolean; onOpenChange: (open: boolean) => void; contact?: Contact }

/** Add or edit a contact, including leads and customers, in the side drawer (R9, R21, D13). */
export function ContactForm({ open, onOpenChange, contact }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const organizations = useOrganizations()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (open)
      form.reset({
        name: contact?.name ?? '',
        job_title: contact?.job_title ?? '',
        organization_id: contact?.organization_id ? String(contact.organization_id) : '',
        status: contact?.status ?? 'lead',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
      })
  }, [open, contact, form])

  async function submit(v: Values) {
    try {
      await saveContact(
        {
          name: v.name,
          job_title: v.job_title || null,
          organization_id: v.organization_id ? Number(v.organization_id) : null,
          status: v.status,
          email: v.email || null,
          phone: v.phone || null,
        },
        contact?.id,
      )
      await refreshAll(queryClient)
      toast('Contact saved')
      onOpenChange(false)
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {}
      Object.entries(fields).forEach(([name, message]) => form.setError(name as keyof Values, { message }))
      if (!Object.keys(fields).length) form.setError('root', { message: errorMessage(e) })
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? 'Edit contact' : 'New contact'}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="contact-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save contact'}
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field id="contact-name" label="Name" error={errors.name?.message}>
          <input className="input" autoComplete="off" {...fieldProps('contact-name', errors.name?.message)} {...form.register('name')} />
        </Field>
        <Field id="contact-status" label="Status">
          <select className="select" {...fieldProps('contact-status')} {...form.register('status')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="contact-org" label="Organization" hint="(optional)" error={errors.organization_id?.message}>
          {/* Rendered once the options exist, so the contact's current value is applied to it. */}
          {organizations.data ? (
            <select className="select" {...fieldProps('contact-org', errors.organization_id?.message)} {...form.register('organization_id')}>
              <option value="">No organization</option>
              {organizations.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <select id="contact-org" className="select" disabled>
              <option>Loading…</option>
            </select>
          )}
        </Field>
        <Field id="contact-title" label="Job title" hint="(optional)" error={errors.job_title?.message}>
          <input className="input" autoComplete="off" {...fieldProps('contact-title', errors.job_title?.message)} {...form.register('job_title')} />
        </Field>
        <Field id="contact-email" label="Email" hint="(optional)" error={errors.email?.message}>
          <input className="input" type="email" autoComplete="off" {...fieldProps('contact-email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Field id="contact-phone" label="Phone" hint="(optional)" error={errors.phone?.message}>
          <input className="input" type="tel" autoComplete="off" {...fieldProps('contact-phone', errors.phone?.message)} {...form.register('phone')} />
        </Field>
        {errors.root && (
          <p className="late" role="alert">
            {errors.root.message}
          </p>
        )}
      </form>
    </Drawer>
  )
}
