import { spawn, type ChildProcess } from 'node:child_process'
import { E2E_ENV, ROOT } from '../env'
import { expect, test } from '../fixtures'

// R5: what's saved is still there after the backend stops and starts again. This starts its own
// backend on the test database, on a port of its own, so it can stop it.
const PORT = '8101'
const BASE = `http://127.0.0.1:${PORT}/api`

async function startBackend(): Promise<ChildProcess> {
  const server = spawn('uv', ['run', 'uvicorn', 'backend.app.main:app', '--port', PORT], {
    cwd: ROOT,
    env: { ...process.env, ...E2E_ENV },
    stdio: 'ignore',
  })
  await expect
    .poll(async () => (await fetch(`${BASE}/stages`).catch(() => null))?.ok ?? false, { timeout: 30_000 })
    .toBe(true)
  return server
}

async function stopBackend(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  await exited
}

test('an organization saved before a restart is there after it', async ({ page }) => {
  let server = await startBackend()
  try {
    const saved = await fetch(`${BASE}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Survives Restart Ltd' }),
    })
    expect(saved.status).toBe(201)
    await stopBackend(server)
    await expect.poll(async () => (await fetch(`${BASE}/stages`).catch(() => null)) === null).toBe(true)

    server = await startBackend()
    const names = ((await (await fetch(`${BASE}/organizations`)).json()) as { name: string }[]).map((o) => o.name)
    expect(names).toContain('Survives Restart Ltd')
  } finally {
    await stopBackend(server)
  }

  // And the app shows it.
  await page.goto('/organizations')
  await expect(page.getByRole('link', { name: 'Survives Restart Ltd' })).toBeVisible()
})
