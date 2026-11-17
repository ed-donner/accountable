// TF09: the ring shows the percentage and fills the arc to match.
import { render, screen } from "@testing-library/react";
import { CIRCUMFERENCE, ProbabilityRing } from "./ProbabilityRing";

test.each([0, 25, 75, 100])("%i%%", (value) => {
  render(<ProbabilityRing value={value} color="var(--stage-proposal)" />);
  expect(screen.getByRole("img", { name: `${value}% probability` })).toHaveTextContent(`${value}%`);
  const [filled, total] = screen.getByTestId("ring-arc").getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(total).toBeCloseTo(CIRCUMFERENCE, 1);
  expect(filled / total).toBeCloseTo(value / 100, 2);
});
