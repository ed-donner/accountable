import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { FakeObserver, stubObserver } from "./test-books";
import { useLoadMore } from "./useLoadMore";

type Props = { hasNext: boolean; loading: boolean; pages: number; fetchNext: () => void };

function List(props: Props) {
  const { sentinel, loadMore } = useLoadMore(props);
  return (
    <>
      <div ref={sentinel}>The end</div>
      <button type="button" onClick={loadMore}>
        Load more
      </button>
    </>
  );
}

beforeEach(stubObserver);
afterEach(() => vi.unstubAllGlobals());

describe("loading on scroll", () => {
  it("asks for the next page when the end comes into view", () => {
    const fetchNext = vi.fn();
    render(<List hasNext loading={false} pages={1} fetchNext={fetchNext} />);
    act(() => FakeObserver.see());
    expect(fetchNext).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing while a page is loading", () => {
    const fetchNext = vi.fn();
    render(<List hasNext loading pages={1} fetchNext={fetchNext} />);
    act(() => FakeObserver.see());
    expect(fetchNext).not.toHaveBeenCalled();
  });

  it("asks for nothing once every page is in, and watches nothing", () => {
    const fetchNext = vi.fn();
    render(<List hasNext={false} loading={false} pages={3} fetchNext={fetchNext} />);
    expect(FakeObserver.all).toHaveLength(0);
    act(() => FakeObserver.see());
    expect(fetchNext).not.toHaveBeenCalled();
  });

  it("starts a new observer for each page, so an end still in view asks again", () => {
    const fetchNext = vi.fn();
    const { rerender } = render(<List hasNext loading={false} pages={1} fetchNext={fetchNext} />);
    const first = FakeObserver.all[0];
    rerender(<List hasNext loading={false} pages={2} fetchNext={fetchNext} />);
    expect(FakeObserver.all).toHaveLength(1);
    expect(FakeObserver.all[0]).not.toBe(first);
  });

  it("does the same from the Load more button, which needs no observer", async () => {
    vi.unstubAllGlobals(); // jsdom has none, as in the tests of every page.
    const fetchNext = vi.fn();
    render(<List hasNext loading={false} pages={1} fetchNext={fetchNext} />);
    await user().click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNext).toHaveBeenCalledTimes(1);
  });

  it("keeps the button from asking while loading or when all are in", async () => {
    vi.unstubAllGlobals();
    const fetchNext = vi.fn();
    const { rerender } = render(<List hasNext loading pages={1} fetchNext={fetchNext} />);
    await user().click(screen.getByRole("button", { name: "Load more" }));
    rerender(<List hasNext={false} loading={false} pages={1} fetchNext={fetchNext} />);
    await user().click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNext).not.toHaveBeenCalled();
  });
});
