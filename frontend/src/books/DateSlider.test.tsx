import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stops } from "./balance";
import { DateSlider } from "./DateSlider";

const STOPS = stops("2026-11-06");

function show(index = 11) {
  const onChange = vi.fn();
  render(<DateSlider stops={STOPS} index={index} onChange={onChange} />);
  return { onChange, slider: screen.getByRole("slider", { name: "Date" }) as HTMLInputElement };
}

describe("DateSlider", () => {
  it("is a range named Date with 12 steps, and the day written out for its value", () => {
    const { slider } = show(10);
    expect([slider.type, slider.min, slider.max, slider.step, slider.value]).toEqual(["range", "0", "11", "1", "10"]);
    expect(slider.getAttribute("aria-valuetext")).toBe("Oct 31, 2026");
  });

  it("writes today out too", () => {
    expect(show().slider.getAttribute("aria-valuetext")).toBe("Nov 6, 2026");
  });

  it.each([
    ["{ArrowLeft}", 5, 4],
    ["{ArrowDown}", 5, 4],
    ["{ArrowRight}", 5, 6],
    ["{ArrowUp}", 5, 6],
    ["{Home}", 5, 0],
    ["{End}", 5, 11],
  ])("moves on %s from stop %i to stop %i", async (key, from, to) => {
    const { slider, onChange } = show(from);
    slider.focus();
    fireEvent.keyDown(slider, { key: key.slice(1, -1) });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(to);
  });

  it("stays at the first stop on a key back", () => {
    const { slider, onChange } = show(0);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays at the last stop on End", () => {
    const { slider, onChange } = show(11);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves to the stop dragged to", () => {
    const { slider, onChange } = show();
    fireEvent.change(slider, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("names each stop by its month, the last Today, with the year under the first and each January", () => {
    show();
    const names = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(names).toEqual([
      "Dec2025",
      "Jan2026",
      ...["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      "Today",
    ]);
  });

  it("puts the chosen name in ink and semibold and the others in neither", () => {
    show(10);
    expect(screen.getByText("Oct").className).toContain("font-semibold");
    expect(screen.getByText("Oct").className).toContain("text-ink");
    expect(screen.getByText("Sep").className).not.toContain("font-semibold");
    expect(screen.getByText("Today").className).not.toContain("font-semibold");
  });

  it("draws the track to the thumb and shows the focus ring on it", () => {
    const { slider } = show(11);
    expect(slider.className).toBe("date-slider");
    expect(slider.style.getPropertyValue("--stop")).toBe("calc(10px + (100% - 20px) * 1)");
  });
});
