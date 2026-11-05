import cases from "../../../shared/accent-cases.json";

// The accent color's check (B20), as company/schemas.py makes it: # and six hex digits,
// at least 4.5:1 against white by WCAG's contrast ratio, kept in capitals. Both sides run
// the cases in shared/accent-cases.json, which also holds the messages, since one of them
// names a color as an example.

export const ACCENT_FORMAT_MESSAGE = cases.messages.format;
export const ACCENT_LIGHT_MESSAGE = cases.messages.light;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/** Small text needs 4.5:1, so text in the accent on white, and white text on it, can both be read. */
const LEAST_CONTRAST = 4.5;

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG's contrast ratio between #RRGGBB and white. */
export function contrastWithWhite(color: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  return 1.05 / (luminance + 0.05);
}

/** Whether a typed color is # and six hex digits, whatever its contrast. */
export function isHexColor(typed: string): boolean {
  return HEX_COLOR.test(typed.trim());
}

/** What's wrong with a typed accent color, if anything. */
export function accentProblem(typed: string): string | undefined {
  const color = typed.trim();
  if (!HEX_COLOR.test(color)) return ACCENT_FORMAT_MESSAGE;
  return contrastWithWhite(color) < LEAST_CONTRAST ? ACCENT_LIGHT_MESSAGE : undefined;
}

/** A color as it's kept: # and six capitals. */
export function keptAccent(typed: string): string {
  return typed.trim().toUpperCase();
}
