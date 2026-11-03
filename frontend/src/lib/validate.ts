// The backend checks these too and has the last word. Checking here as well
// means ordinary mistakes never reach the network, or the browser's console.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

export const EMAIL_MESSAGE = "Enter a valid email address";
export const WEBSITE_MESSAGE = "Enter a website address, such as https://example.com";

/** The largest id the backend accepts, which is where Postgres's integer columns stop. */
const MAX_ID = 2 ** 31 - 1;

/** The id in a record's address, or null if it can't be one. */
export function recordId(text: string | undefined): number | null {
  const id = Number(text);
  return text && /^[1-9]\d*$/.test(text) && id <= MAX_ID ? id : null;
}

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

export function isWebsite(value: string): boolean {
  if (/\s/.test(value)) return false;
  const address = HAS_SCHEME.test(value) ? value : `https://${value}`;
  // new URL would repair "http:example.com", which the backend refuses.
  if (!/^https?:\/\/[^/]/i.test(address)) return false;
  try {
    return new URL(address).hostname !== "";
  } catch {
    return false;
  }
}
