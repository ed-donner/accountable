import { useCallback, useEffect, useState } from "react";

type Paging = {
  hasNext: boolean;
  /** A page is being read. */
  loading: boolean;
  /** How many pages are in, so a page that leaves the end still in view asks for the next. */
  pages: number;
  fetchNext: () => unknown;
};

/**
 * Loads the next page once the list's end comes within a screen of the view (J20). Gives the ref for
 * an element after the last row, and a loadMore for the Load more button, which does the same thing for
 * anyone who can't scroll. A new observer starts for each page, because an observer only speaks when
 * the element comes into view or leaves it, and a short page can leave the end in view.
 */
export function useLoadMore({ hasNext, loading, pages, fetchNext }: Paging) {
  const [end, setEnd] = useState<Element | null>(null);

  const loadMore = useCallback(() => {
    if (hasNext && !loading) void fetchNext();
  }, [hasNext, loading, fetchNext]);

  useEffect(() => {
    if (!end || !hasNext || loading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (seen) => {
        if (seen.some((item) => item.isIntersecting)) loadMore();
      },
      { rootMargin: `0px 0px ${window.innerHeight}px 0px` },
    );
    observer.observe(end);
    return () => observer.disconnect();
    // `pages` is here on purpose: a new page needs a new observer, which reports where the end is now.
  }, [end, hasNext, loading, pages, loadMore]);

  return { sentinel: setEnd, loadMore };
}
