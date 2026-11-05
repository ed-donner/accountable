import type { Category } from "./queries";

export type CategoryStyle = {
  value: Category;
  label: string;
  /** The round swatch's Tailwind class. */
  swatch: string;
  /** The color for a chart's bars. */
  fill: string;
};

/**
 * The six, in the order every list, chart and legend shows them, each in the brand's colors
 * in the brand's order, and Other in the soft bar's quiet grey (E6).
 */
export const CATEGORIES: CategoryStyle[] = [
  { value: "software", label: "Software", swatch: "bg-sea-green", fill: "var(--color-sea-green)" },
  { value: "contractors", label: "Contractors", swatch: "bg-marigold", fill: "var(--color-marigold)" },
  { value: "travel", label: "Travel", swatch: "bg-coral", fill: "var(--color-coral)" },
  { value: "office", label: "Office", swatch: "bg-cerulean", fill: "var(--color-cerulean)" },
  { value: "marketing", label: "Marketing", swatch: "bg-raspberry", fill: "var(--color-raspberry)" },
  { value: "other", label: "Other", swatch: "bg-bar-soft", fill: "var(--color-bar-soft)" },
];

export function categoryStyle(category: Category): CategoryStyle {
  return CATEGORIES.find((item) => item.value === category)!;
}

/** Its place in the list's order, for sorting. */
export function categoryPlace(category: Category): number {
  return CATEGORIES.findIndex((item) => item.value === category);
}

export function Swatch({ category }: { category: Category }) {
  return <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${categoryStyle(category).swatch}`} />;
}

/** The round swatch beside the name in ink, so the color never carries the meaning alone. */
export function CategoryLabel({ category }: { category: Category }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Swatch category={category} />
      <span className="truncate">{categoryStyle(category).label}</span>
    </span>
  );
}
