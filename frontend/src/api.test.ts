import { describe, expect, it } from 'vitest'
import { api, ApiError } from './api'
import { fakeApi } from './test-utils'

describe('api', () => {
  it('returns JSON and sends bodies as JSON', async () => {
    const mock = fakeApi({ 'POST /organizations': (body: unknown) => ({ status: 201, json: { id: 1, ...(body as object) } }) })
    await expect(api('/organizations', 'POST', { name: 'Acme' })).resolves.toEqual({ id: 1, name: 'Acme' })
    expect(mock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('turns a 422 into one message per field (R58)', async () => {
    fakeApi({ 'POST /deals': () => ({ status: 422, json: { detail: 'Check the highlighted fields', fields: { name: 'This is required' } } }) })
    const error = await api<never>('/deals', 'POST', {}).catch((e: ApiError) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.fields).toEqual({ name: 'This is required' })
  })

  it('turns a 409 into a message a dialog can show (R27)', async () => {
    fakeApi({ 'DELETE /organizations/1': () => ({ status: 409, json: { detail: 'Acme has 3 deals.' } }) })
    const error = await api<never>('/organizations/1', 'DELETE').catch((e: ApiError) => e)
    expect(error.message).toBe('Acme has 3 deals.')
  })

  it('returns nothing for a 204', async () => {
    fakeApi({ 'DELETE /contacts/1': () => ({ status: 204 }) })
    await expect(api('/contacts/1', 'DELETE')).resolves.toBeUndefined()
  })
})
