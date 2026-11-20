import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moveCard } from "@/lib/board";
import { messages } from "@/lib/words";
import { api } from "./client";
import { refreshAll } from "./refresh";
import type { Deal, Pipeline, Stage } from "./types";

export const PIPELINE_KEY = ["pipeline"] as const;

export function usePipeline() {
  return useQuery({ queryKey: PIPELINE_KEY, queryFn: () => api<Pipeline>("/pipeline") });
}

const MOVE_KEY = ["move-deal"] as const;

export type CardMove = { id: number; from: Stage; stage: Stage; beforeId: number | null; today: string };

/**
 * Save a card's move, following TanStack Query's optimistic update pattern
 * (plan, Phase 7): the board changes in the cache first, goes back if the save
 * fails, and everything is refreshed either way.
 */
export function useMoveDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MOVE_KEY,
    mutationFn: (move: CardMove) =>
      api<Deal>(`/deals/${move.id}/move`, { method: "POST", body: { stage: move.stage, before_id: move.beforeId } }),
    onMutate: async (move) => {
      // A refetch landing now would overwrite the moved card.
      await queryClient.cancelQueries({ queryKey: PIPELINE_KEY });
      const before = queryClient.getQueryData<Pipeline>(PIPELINE_KEY);
      if (before) {
        queryClient.setQueryData(PIPELINE_KEY, moveCard(before, move.id, move.stage, move.beforeId, move.today));
      }
      return { before };
    },
    onError: (_error, _move, saved) => {
      if (saved?.before) queryClient.setQueryData(PIPELINE_KEY, saved.before);
      toast.error(messages.moveFailed);
    },
    onSuccess: (_deal, move) => {
      if (move.stage !== move.from) toast.success(messages.moved(move.stage));
    },
    // Refresh once the last of several quick moves is done, so an early answer
    // doesn't bring back a card that a later move has already moved.
    onSettled: () => (queryClient.isMutating({ mutationKey: MOVE_KEY }) === 1 ? refreshAll(queryClient) : undefined),
  });
}
