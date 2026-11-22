// TF10: the Late badge shows only for open deals past their close date (the backend's is_late).
import { render, screen } from "@testing-library/react";
import { LateBadge } from "./LateBadge";
import { FollowUpChip } from "./FollowUpChip";

test("shown when late", () => {
  render(<LateBadge late />);
  expect(screen.getByText("Late")).toHaveClass("badge", "late");
});

test("hidden otherwise", () => {
  const { container } = render(<LateBadge late={false} />);
  expect(container).toBeEmptyDOMElement();
});

test("follow-up chips say Today, or the date, and their state", () => {
  render(
    <>
      <FollowUpChip date="2026-11-16" status="upcoming" today="2026-11-16" />
      <FollowUpChip date="2026-11-09" status="overdue" today="2026-11-16" />
      <FollowUpChip date="2026-11-02" status="done" today="2026-11-16" />
    </>,
  );
  expect(screen.getByLabelText("Follow-up Today, due")).toHaveClass("upcoming");
  expect(screen.getByLabelText("Follow-up 9 Nov, overdue")).toHaveClass("overdue");
  expect(screen.getByLabelText("Follow-up 2 Nov, done").querySelector("svg")).not.toBeNull();
});
