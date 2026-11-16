import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, errorMessage, refreshAll } from '../../api'
import { Drawer } from '../../components/Drawer'
import { Field, fieldProps, nameField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { dollarsToCents, money } from '../../format'
import { useContacts } from '../contacts/api'
import { useOrganizations } from '../organizations/api'
import { saveDeal, STAGE_NAMES, useStages, type Deal, type DealInput, type StageName } from './api'

/** The server's limit per deal (deals.py MAX_CENTS), in dollars. */
const MAX_DOLLARS = 10_000_000_000

const schema = z.object({
  name: nameField('Enter a name'),
  organization_id: z.string().min(1, 'Choose an organization'),
  main_contact_id: z.string(),
  stage: z.enum(STAGE_NAMES),
  value: z
    .string()
    .trim()
    .min(1, 'Enter a value')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Enter an amount of 0 or more')
    .refine((v) => !(Number(v) > MAX_DOLLARS), `Enter an amount up to ${money(MAX_DOLLARS * 100)}`),
  probability: z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100), 'Enter a whole number from 0 to 100'),
  close_date: z.string().min(1, 'Enter a close date'),
})
type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal?: Deal
  /** The stage for a new deal, when it's added from a pipeline column (R42). */
  defaultStage?: StageName
}

/** Add or edit a deal in the side drawer (R10, R14, R15, R21, D13). */
export function DealForm({ open, onOpenChange, deal, defaultStage = 'New' }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const organizations = useOrganizations()
  const contacts = useContacts()
  const stages = useStages()
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState
  const stage = useWatch({ control: form.control, name: 'stage' })
  const usual = stages.data?.find((s) => s.name === stage)?.probability

  useEffect(() => {
    if (open)
      form.reset({
        name: deal?.name ?? '',
        organization_id: deal ? String(deal.organization_id) : '',
        main_contact_id: deal?.main_contact_id ? String(deal.main_contact_id) : '',
        stage: deal?.stage ?? defaultStage,
        value: deal ? String(deal.value_cents / 100) : '',
        probability: deal ? String(deal.probability) : '',
        close_date: deal?.close_date ?? '',
      })
  }, [open, deal, defaultStage, form])

  async function submit(v: Values) {
    const input: DealInput = {
      name: v.name,
      organization_id: Number(v.organization_id),
      main_contact_id: v.main_contact_id ? Number(v.main_contact_id) : null,
      stage: v.stage,
      value_cents: dollarsToCents(Number(v.value)),
      close_date: v.close_date,
    }
    // A blank probability on a new deal takes the stage's usual one (R14).
    if (v.probability !== '') input.probability = Number(v.probability)
    try {
      await saveDeal(input, deal?.id)
      await refreshAll(queryClient)
      toast('Deal saved')
      onOpenChange(false)
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields : {}
      Object.entries(fields).forEach(([name, message]) =>
        form.setError((name === 'value_cents' ? 'value' : name) as keyof Values, { message }),
      )
      if (!Object.keys(fields).length) form.setError('root', { message: errorMessage(e) })
    }
  }

  const stageChanged = deal && stage !== deal.stage

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? 'Edit deal' : 'New deal'}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="deal-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save deal'}
          </button>
        </>
      }
    >
      <form id="deal-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field id="deal-name" label="Name" error={errors.name?.message}>
          <input className="input" autoComplete="off" {...fieldProps('deal-name', errors.name?.message)} {...form.register('name')} />
        </Field>
        <Field id="deal-org" label="Organization" error={errors.organization_id?.message}>
          {/* Rendered once the options exist, so the deal's current value is applied to it. */}
          {organizations.data ? (
            <select className="select" {...fieldProps('deal-org', errors.organization_id?.message)} {...form.register('organization_id')}>
              <option value="">Choose an organization</option>
              {organizations.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <select id="deal-org" className="select" disabled>
              <option>Loading…</option>
            </select>
          )}
        </Field>
        <Field id="deal-contact" label="Main contact" hint="(optional)" error={errors.main_contact_id?.message}>
          {contacts.data ? (
            <select className="select" {...fieldProps('deal-contact', errors.main_contact_id?.message)} {...form.register('main_contact_id')}>
              <option value="">No main contact</option>
              {contacts.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.organization_name ? `, ${c.organization_name}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <select id="deal-contact" className="select" disabled>
              <option>Loading…</option>
            </select>
          )}
        </Field>
        <Field id="deal-stage" label="Stage">
          <select className="select" {...fieldProps('deal-stage')} {...form.register('stage')}>
            {STAGE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field id="deal-value" label="Value (USD)" error={errors.value?.message}>
          <input className="input mono" inputMode="decimal" {...fieldProps('deal-value', errors.value?.message)} {...form.register('value')} />
        </Field>
        <Field
          id="deal-probability"
          label="Probability of close (%)"
          hint={stageChanged ? `(changing the stage sets it to ${usual}%)` : deal ? undefined : `(leave blank for the usual ${usual ?? ''}%)`}
          error={errors.probability?.message}
        >
          <input
            className="input mono"
            inputMode="numeric"
            readOnly={!!stageChanged}
            {...fieldProps('deal-probability', errors.probability?.message)}
            {...form.register('probability')}
          />
        </Field>
        <Field id="deal-close" label="Close date" error={errors.close_date?.message}>
          <input className="input" type="date" {...fieldProps('deal-close', errors.close_date?.message)} {...form.register('close_date')} />
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
