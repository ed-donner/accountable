import fonts from "../../../shared/document-fonts.json";

// Which characters invoices can show, and the words for those they can't (V9, V10), as
// company/characters.py says them, from the same table in shared/document-fonts.json.

/** Every character the invoice's five fonts share, and the line break, which the layout keeps. */
const SHOWN = new Set([...fonts.characters, "\n"]);

/** The characters in the text that invoices can't show, each once, in the order they come. */
export function unprintable(text: string | null | undefined): string[] {
  const found: string[] = [];
  for (const character of text ?? "") {
    if (!SHOWN.has(character) && !found.includes(character)) found.push(character);
  }
  return found;
}

/**
 * A character as a message says it. One that can't be seen would show as empty quotes, so it
 * gets a name, from its Unicode category, as characters.py names it.
 */
function nameOf(character: string): string {
  if (character === "\t") return "a tab";
  if (/^\p{Z}$/u.test(character)) return "an unusual space";
  if (/^\p{C}$/u.test(character)) return "an invisible character";
  return `"${character}"`;
}

/** "漢", "漢" and "😀", or "漢", a tab and "😀", each name once. */
export function named(characters: string[]): string {
  const names = [...new Set(characters.map(nameOf))];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** For the Bill to and a description, which can be changed on the draft. */
export function fieldMessage(characters: string[]): string {
  return `Invoices can't show ${named(characters)}. Take ${characters.length === 1 ? "it" : "them"} out to save`;
}

/** For a line's name, which was taken from its product and can't be changed on the draft. */
export function lineNameMessage(characters: string[]): string {
  return `Invoices can't show ${named(characters)}. Remove this line, rename the product and add it again`;
}

/** For one of the company's details, which issuing copies and only Company settings can change. */
export function companyMessage(field: string, characters: string[]): string {
  return `The ${field} in Company settings has ${named(characters)}, which invoices can't show. Change it there before issuing.`;
}
