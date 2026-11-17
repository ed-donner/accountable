import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, failureMessage, type Schemas } from "../shared/api";
import { useToast } from "../shared/Toast";
import { localToday } from "../shared/today";
import type { DealRow } from "../deals/hooks";
import { applyMove, type Move } from "./board";

export const BOARD_KEY = ["deals", "all"] as const;
type DealList = Schemas["DealList"];

/** P6: the board changes the moment a card drops; a failed save puts it back (R6). */
export function useMoveDeal() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
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
        client.setQueryData<DealList>(BOARD_KEY, { ...previous, items: applyMove(previous.items, move, localToday()) });
      }
      return { previous };
    },
    onError: (error, move, context) => {
      if (context?.previous) client.setQueryData(BOARD_KEY, context.previous);
      const name = context?.previous?.items.find((d) => d.id === move.id)?.name ?? "the deal";
      toast.error(failureMessage(`move ${name}`, error));
    },
    onSettled: () => client.invalidateQueries(),
  });
}
