import type { KeyboardEvent } from "react";

import { formatDate } from "../lib/dates";
import type { Stop } from "./balance";

type Props = {
  stops: Stop[];
  /** The chosen stop's place, from the first. */
  index: number;
  onChange: (index: number) => void;
};

/** Where a stop's center is across the track: the thumb stays inside it, half its width in from each end. */
function across(index: number, last: number) {
  return `calc(10px + (100% - 20px) * ${index / last})`;
}

/**
 * The day, chosen from the last 12 months' stops (X9). A native range input with 12 steps, so
 * the mouse and touch work as it does everywhere. The keys are handled here too, so each moves
 * to the stop the spec says whatever the browser does with a range's own.
 */
export function DateSlider({ stops, index, onChange }: Props) {
  const last = stops.length - 1;

  function press(event: KeyboardEvent<HTMLInputElement>) {
    const to = {
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = Math.min(last, Math.max(0, to));
    if (next !== index) onChange(next);
  }

  return (
    <div>
      <input
        type="range"
        className="date-slider"
        aria-label="Date"
        aria-valuetext={formatDate(stops[index].day)}
        min={0}
        max={last}
        step={1}
        value={index}
        style={{ "--stop": across(index, last) } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={press}
      />
      <ol className="relative mt-1.5 h-10 text-[12px] leading-4 text-muted">
        {stops.map((stop, place) => (
          <li
            key={stop.day}
            data-chosen={place === index}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: across(place, last) }}
          >
            <span aria-hidden="true" className="mb-1 size-1.5 rounded-full bg-line" />
            <span className={place === index ? "font-semibold text-ink" : undefined}>{stop.label}</span>
            {stop.year !== undefined && <span>{stop.year}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
