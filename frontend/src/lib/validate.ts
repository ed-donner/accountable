// The backend checks these too and has the last word. Checking here as well
// means ordinary mistakes never reach the network, or the browser's console.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

export const EMAIL_MESSAGE = "Enter a valid email address";
export const WEBSITE_MESSAGE = "Enter a website address, such as https://example.com";

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

export function isWebsite(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}
