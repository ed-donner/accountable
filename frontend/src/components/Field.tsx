import type { ReactNode } from 'react'
import { z } from 'zod'
import styles from './Field.module.css'

// The backend's limits (backend/app/api.py), so a form says so before anything is sent.
export const MAX_NAME = 200
export const MAX_TEXT = 5000
const tooLong = (max: number) => `Keep this to ${max} characters or fewer`

/** A required name, such as a deal's or a contact's. */
export const nameField = (required: string) => z.string().trim().min(1, required).max(MAX_NAME, tooLong(MAX_NAME))

/** Optional free text, such as notes or a job title. */
export const textField = () => z.string().trim().max(MAX_TEXT, tooLong(MAX_TEXT))

/** Required longer text, such as what an activity was about. */
export const longTextField = (required: string) => z.string().trim().min(1, required).max(MAX_TEXT, tooLong(MAX_TEXT))

/** A website: `acme.com` is fine (the server adds https://); other schemes, like `file:`, aren't. */
export const websiteField = () =>
  textField()
    .refine((v) => !/\s/.test(v), 'Enter a web address, such as acme.com')
    .refine((v) => !/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v) || /^https?:\/\//i.test(v), 'Enter a web address starting with http:// or https://')

/** Attributes that tie an input to its label and its error message (R58). */
export function fieldProps(id: string, error?: string) {
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined }
}

/** A visible label, the input, and its error next to it, announced to screen readers (R58). */
export function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {hint && <span className={styles.hint}> {hint}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
