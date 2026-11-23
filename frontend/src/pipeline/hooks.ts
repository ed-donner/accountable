import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, failureMessage, type Schemas } from "../shared/api";
import { useToast } from "../shared/Toast";
import { localToday } from "../shared/today";
import type { DealRow } from "../deals/hooks";
import { applyMove, type Move } from "./board";

export const BOARD_KEY = ["deals", "all"] as const;
const MOVE_KEY = ["move-deal"] as const;
type DealList = Schemas["DealList"];

/**
 * P6: the board changes the moment a card drops; a failed save puts it back (R6).
 * Several cards can be saving at once (RV7), so a failure puts back only its own
 * card, and the board reloads from the server only once the last move has saved.
 * Moves are sent one after another (the shared scope), so a card dropped next to one
 * that's still saving names a neighbour the server already has in that column.
 */
export function useMoveDeal() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: MOVE_KEY,
    scope: { id: "move-deal" },
    mutationFn: (move: Move) =>
      api<DealRow>(`/deals/${move.id}/move`, "POST", {
        stage: move.stage,
        after_id: move.afterId,
        before_id: move.beforeId,
      }),
    onMutate: async (move) => {
      await client.cancelQueries({ queryKey: BOARD_KEY });
      const previous = client.getQueryData<DealList>(BOARD_KEY);
      if (previous) {
        client.setQueryData<DealList>(BOARD_KEY, {
          ...previous,
          items: applyMove(previous.items, move, localToday()),
        });
      }
      return { previous };
    },
    onError: (error, move, context) => {
      const original = context?.previous?.items.find((d) => d.id === move.id);
      if (original) {
        client.setQueryData<DealList>(
          BOARD_KEY,
          (current) =>
            current && {
              ...current,
              items: current.items.map((d) => (d.id === move.id ? original : d)),
            },
        );
      }
      toast.error(failureMessage(`move ${original?.name ?? "the deal"}`, error));
    },
    // This move still counts as pending here, so 1 means no other move is saving.
    onSettled: () => {
      if (client.isMutating({ mutationKey: MOVE_KEY }) <= 1) return client.invalidateQueries();
    },
  });
}
