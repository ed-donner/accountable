import { join } from 'node:path'

export const ROOT = join(__dirname, '..')

function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today for the whole run, so a run that crosses midnight doesn't change its mind (D9). */
export const TODAY = process.env.ACCOUNTABLE_TODAY ?? localDate()

/** The environment for the test servers and the seed command: a database of their own (R6). */
export const E2E_ENV = {
  ACCOUNTABLE_DB: join(ROOT, 'e2e', '.data', 'test.db'),
  ACCOUNTABLE_TODAY: TODAY,
  ACCOUNTABLE_API_PORT: '8100',
  ACCOUNTABLE_WEB_PORT: '5180',
}
