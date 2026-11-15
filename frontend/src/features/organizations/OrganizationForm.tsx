import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, refreshAll } from '../../api'
import { Drawer } from '../../components/Drawer'
import { Field, fieldProps } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { saveOrganization, type Organization } from './api'

export const INDUSTRIES = ['Construction', 'Financial Services', 'Healthcare', 'Logistics', 'Manufacturing', 'Retail', 'Software']

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  website: z.string().trim(),
  industry: z.string().trim(),
  notes: z.string().trim(),
})
type Values = z.infer<typeof schema>

type Props = { open: boolean; onOpenChange: (open: boolean) => void; organization?: Organization }

/** Add or edit an organization in the side drawer (R8, R21, D13, D14). */
export function OrganizationForm({ open, onOpenChange, organization }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (open)
      form.reset({
        name: organization?.name ?? '',
        website: organization?.website ?? '',
        industry: organization?.industry ?? '',
        notes: organization?.notes ?? '',
      })
  }, [open, organization, form])

  async function submit(values: Values) {
    try {
      const empty = (s: string) => s || null
      await saveOrganization(
        { name: values.name, website: empty(values.website), industry: empty(values.industry), notes: empty(values.notes) },
        organization?.id,
      )
      await refreshAll(queryClient)
      toast('Organization saved')
      onOpenChange(false)
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {}
      Object.entries(fields).forEach(([name, message]) => form.setError(name as keyof Values, { message }))
      form.setError('root', { message: e instanceof ApiError ? e.message : 'Something went wrong. Try again.' })
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={organization ? 'Edit organization' : 'New organization'}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="organization-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save organization'}
          </button>
        </>
      }
    >
      <form id="organization-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field id="org-name" label="Name" error={errors.name?.message}>
          <input className="input" autoComplete="off" {...fieldProps('org-name', errors.name?.message)} {...form.register('name')} />
        </Field>
        <Field id="org-industry" label="Industry" hint="(optional)">
          <input className="input" list="industries" autoComplete="off" {...fieldProps('org-industry')} {...form.register('industry')} />
          <datalist id="industries">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
        <Field id="org-website" label="Website" hint="(optional)">
          <input className="input" type="url" placeholder="https://" {...fieldProps('org-website')} {...form.register('website')} />
        </Field>
        <Field id="org-notes" label="Notes" hint="(optional)">
          <textarea className="textarea" {...fieldProps('org-notes')} {...form.register('notes')} />
        </Field>
        {errors.root && !Object.keys(errors).some((k) => k !== 'root') && (
          <p className="late" role="alert">
            {errors.root.message}
          </p>
        )}
      </form>
    </Drawer>
  )
}
