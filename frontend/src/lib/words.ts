/** "1 deal", "3 deals", "1 activity", "2 activities", "12 days". */
export function plural(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  const many = /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${count} ${many}`;
}

/** "2 quotes", "2 quotes and 1 invoice", "2 quotes, 1 invoice and 3 bills". */
export function listed(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
