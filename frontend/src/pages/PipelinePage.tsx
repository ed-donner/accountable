import { useState } from "react";
import { useToday } from "@/api/meta";
import { usePipeline } from "@/api/pipeline";
import type { Stage } from "@/api/types";
import { Board, BoardPlaceholder } from "@/components/board/Board";
import { DealForm } from "@/components/forms/DealForm";
import { Band } from "@/components/layout/Band";
import { LoadFailed } from "@/components/states";

export default function PipelinePage() {
  const pipeline = usePipeline();
  const today = useToday();
  // The stage a new deal starts at: the column's own Add deal button (PIPE-7).
  const [adding, setAdding] = useState<Stage | null>(null);

  let content;
  if (pipeline.isError) {
    content = (
      <>
        <Band title="Pipeline" />
        <LoadFailed message={pipeline.error.message} />
      </>
    );
  } else if (!pipeline.data || !today) {
    content = <BoardPlaceholder />;
  } else {
    content = <Board board={pipeline.data} today={today} onAdd={setAdding} />;
  }

  return (
    <>
      <title>Pipeline · Accountable</title>
      {content}
      <DealForm open={adding !== null} onOpenChange={(open) => !open && setAdding(null)} defaultStage={adding ?? "new"} />
    </>
  );
}
