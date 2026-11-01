/** "1 deal", "3 deals", "1 activity", "2 activities". */
export function plural(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  const many = noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${count} ${many}`;
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
