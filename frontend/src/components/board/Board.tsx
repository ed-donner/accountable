import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMoveDeal } from "@/api/pipeline";
import type { Deal, Pipeline, Stage } from "@/api/types";
import { BandFigure } from "@/components/layout/Band";
import { BandPlaceholder, Placeholder } from "@/components/states";
import { Button } from "@/components/ui/button";
import { beforeIdAfterDrop, boardTotals, COLUMN_PREFIX, columnTotals, moveCard } from "@/lib/board";
import { money } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import { STAGE_NAMES, STAGES } from "@/lib/rules";
import { pipelineLine } from "@/lib/words";
import { BoardColumn } from "./BoardColumn";
import { ColumnHeading } from "./ColumnHeading";
import { DealCard } from "./DealCard";

type Props = {
  board: Pipeline;
  today: string;
  onAdd: (stage: Stage) => void;
};

type Drag = {
  id: number;
  /** The card as it was picked up, for the lifted card. */
  deal: Deal;
  from: Stage;
  /** The cards while dragging. The card changes column as it passes over one, so a gap opens where it will land. */
  draft: Pipeline;
};

function stageOf(id: UniqueIdentifier, board: Pipeline): Stage | null {
  if (typeof id === "string" && id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length) as Stage;
  return board.columns.find((column) => column.deals.some((deal) => deal.id === id))?.stage ?? null;
}

function columnOf(board: Pipeline, stage: Stage) {
  return board.columns.find((column) => column.stage === stage) ?? { stage, deals: [] };
}

function dealOf(board: Pipeline, id: UniqueIdentifier): Deal | undefined {
  return board.columns.flatMap((column) => column.deals).find((deal) => deal.id === id);
}

const KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space"] };

const INSTRUCTIONS = {
  draggable:
    "To open the deal, press Enter. To move it, press Space to pick it up, use the arrow keys to move it, then press Space to drop it or Escape to put it back.",
};

/** The band's figures, the column headings and the columns, which drag with dnd-kit (spec 1.7). */
export function Board({ board, today, onAdd }: Props) {
  const move = useMoveDeal();
  const reducedMotion = useReducedMotion();
  const sensors = useSensors(
    // A drag starts only after 6px, so a click still opens the deal (PIPE-4).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a card up, the arrows move it, Space drops it and Escape puts it back (PIPE-8).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: KEYBOARD_CODES }),
  );

  const [drag, setDrag] = useState<Drag | null>(null);
  // The board just after a drop, shown until the move lands in the query cache,
  // so the card never jumps back for a moment.
  const [dropped, setDropped] = useState<{ base: Pipeline; board: Pipeline } | null>(null);
  if (dropped && dropped.base !== board) setDropped(null);

  const shown = drag?.draft ?? dropped?.board ?? board;
  // The figures change on the drop, not while a card passes over a column.
  const figures = drag ? board : shown;
  const totals = boardTotals(figures);

  // dnd-kit's callbacks read the latest cards from here.
  const shownRef = useRef(shown);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const justChangedColumn = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      justChangedColumn.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [drag?.draft]);

  // With the mouse, the card is over whatever is under the pointer. In the gap
  // between two columns that's nothing, and the card stays where it is: going
  // by the card's outline there let it bounce between the two columns without
  // end, as each move shifted the other column's cards. The keyboard has no
  // pointer, so it goes by the card's outline. Over a column with cards, aim
  // for the closest card in it.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
    let overId = getFirstCollision(hits, "id");
    if (overId != null) {
      const columnStage = typeof overId === "string" ? stageOf(overId, shownRef.current) : null;
      if (columnStage) {
        const ids = new Set<UniqueIdentifier>(columnOf(shownRef.current, columnStage).deals.map((deal) => deal.id));
        if (ids.size > 0) {
          const closest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((container) => ids.has(container.id)),
          });
          overId = closest[0]?.id ?? overId;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    if (justChangedColumn.current) lastOverId.current = args.active.id;
    return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
  }, []);

  function onDragStart({ active }: DragStartEvent) {
    const deal = dealOf(board, active.id);
    if (!deal) return;
    setDrag({ id: deal.id, deal, from: deal.stage, draft: board });
  }

  // Moving over another column moves the card into it, where the pointer is.
  // dnd-kit calls the latest handler after each render, so `drag` is current here.
  function onDragOver({ active, over }: DragOverEvent) {
    // One change of column per frame, so a card can never bounce back and forth.
    if (!over || !drag || justChangedColumn.current) return;
    const from = stageOf(active.id, drag.draft);
    const to = stageOf(over.id, drag.draft);
    if (!from || !to || from === to) return;

    const target = columnOf(drag.draft, to).deals;
    let index = target.length;
    const overIndex = target.findIndex((deal) => deal.id === over.id);
    if (overIndex !== -1) {
      const lifted = active.rect.current.translated;
      const below = lifted ? lifted.top > over.rect.top + over.rect.height / 2 : false;
      index = overIndex + (below ? 1 : 0);
    }
    justChangedColumn.current = true;
    setDrag({ ...drag, draft: moveCard(drag.draft, drag.id, to, target[index]?.id ?? null, today) });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = drag;
    setDrag(null);
    lastOverId.current = null;
    if (!current || !over) return;

    let draft = current.draft;
    let stage = stageOf(active.id, draft);
    if (!stage) return;
    // Dropped over another column before the card had moved into it.
    const overStage = stageOf(over.id, draft);
    if (overStage && overStage !== stage) {
      draft = moveCard(draft, current.id, overStage, typeof over.id === "number" ? over.id : null, today);
      stage = overStage;
    }
    // Within the column the card is in now, place it where it was dropped.
    const deals = columnOf(draft, stage).deals;
    const fromIndex = deals.findIndex((deal) => deal.id === current.id);
    const toIndex = deals.findIndex((deal) => deal.id === over.id);
    if (toIndex !== -1 && toIndex !== fromIndex) {
      draft = {
        ...draft,
        columns: draft.columns.map((column) =>
          column.stage === stage ? { ...column, deals: arrayMove(column.deals, fromIndex, toIndex) } : column,
        ),
      };
    }

    // before_id always comes from the order on screen after the drop.
    const beforeId = beforeIdAfterDrop(columnOf(draft, stage), current.id);
    const unmoved = stage === current.from && beforeId === beforeIdAfterDrop(columnOf(board, current.from), current.id);
    if (unmoved) return;

    setDropped({ base: board, board: moveCard(board, current.id, stage, beforeId, today) });
    move.mutate({ id: current.id, from: current.from, stage, beforeId, today }, { onSettled: () => setDropped(null) });
  }

  function onDragCancel() {
    setDrag(null);
    lastOverId.current = null;
  }

  // Plain words for screen readers (plan, Phase 7). The live region shows one
  // message at a time, so a place already announced isn't announced again;
  // otherwise "Picked up" would be replaced at once by "is over New, position 1".
  const lastPlace = useRef("");
  const nameOf = (id: UniqueIdentifier) => dealOf(shownRef.current, id)?.name ?? dealOf(board, id)?.name ?? "The deal";
  function placeOf(activeId: UniqueIdentifier, overId: UniqueIdentifier) {
    const stage = stageOf(overId, shownRef.current);
    if (!stage) return null;
    const deals = columnOf(shownRef.current, stage).deals;
    const overIndex = deals.findIndex((deal) => deal.id === overId);
    const activeIndex = deals.findIndex((deal) => deal.id === activeId);
    const position = overIndex !== -1 ? overIndex + 1 : activeIndex !== -1 ? activeIndex + 1 : deals.length + 1;
    return { stage: STAGE_NAMES[stage], position };
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const place = placeOf(active.id, active.id);
      lastPlace.current = place ? `${place.stage} ${place.position}` : "";
      return `Picked up ${nameOf(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      const place = over && placeOf(active.id, over.id);
      const key = place ? `${place.stage} ${place.position}` : "";
      if (key === lastPlace.current) return undefined;
      lastPlace.current = key;
      return place
        ? `${nameOf(active.id)} is over ${place.stage}, position ${place.position}.`
        : `${nameOf(active.id)} is no longer over a column.`;
    },
    onDragEnd: ({ active, over }) => {
      const place = over && placeOf(active.id, over.id);
      return place ? `Dropped ${nameOf(active.id)} in ${place.stage}.` : `${nameOf(active.id)} was put back.`;
    },
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back where it was.`,
  };

  const overStage = drag ? stageOf(drag.id, drag.draft) : null;

  return (
    <BoardLayout
      subtitle={pipelineLine(totals.count, totals.late)}
      figures={
        <>
          <BandFigure label="Open pipeline" value={money(totals.value)} />
          <BandFigure label="Expected revenue" value={money(totals.expected)} tone="sea" />
        </>
      }
      onAdd={() => onAdd("new")}
      headings={STAGES.map((stage) => (
        <ColumnHeading key={stage} stage={stage} totals={columnTotals(columnOf(figures, stage))} onAdd={onAdd} />
      ))}
      columns={
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          accessibility={{ announcements, screenReaderInstructions: INSTRUCTIONS }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          {STAGES.map((stage) => (
            <BoardColumn
              key={stage}
              column={columnOf(shown, stage)}
              highlighted={overStage === stage}
              reducedMotion={reducedMotion}
            />
          ))}
          {createPortal(
            <DragOverlay dropAnimation={reducedMotion ? null : { duration: 150, easing: "ease" }}>
              {drag && <DealCard deal={drag.deal} lifted className="cursor-grabbing" />}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      }
    />
  );
}


type LayoutProps = {
  subtitle: string;
  figures: ReactNode;
  onAdd?: () => void;
  headings: ReactNode;
  columns: ReactNode;
};

/**
 * The column headings sit in the band and the columns below them, in one
 * six-column grid. Both are inside one container that scrolls sideways below
 * 1280px, so they stay lined up. The page fills the window, and each column
 * scrolls on its own below its heading.
 */
function BoardLayout({ subtitle, figures, onAdd, headings, columns }: LayoutProps) {
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[620px] flex-col">
      <section className="on-band shrink-0 bg-band px-8 pt-7 text-band-ink-soft">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-9 font-semibold text-band-ink">Pipeline</h1>
            <div className="mt-1 text-band-muted">{subtitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-9">
            {figures}
            <Button onClick={onAdd} disabled={!onAdd}>
              <Plus /> Add deal
            </Button>
          </div>
        </div>
      </section>
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-[1280px] flex-col">
          <div className="on-band shrink-0 bg-band px-8 pt-7 pb-9">
            <div className="grid grid-cols-6 gap-3">{headings}</div>
          </div>
          <div className="min-h-0 flex-1 px-[26px] pt-2.5 pb-4">
            <div className="grid h-full grid-cols-6 grid-rows-[minmax(0,1fr)] gap-3 [&>*]:min-h-0">{columns}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Grey blocks the size of the board, while it loads (spec 2.10). */
export function BoardPlaceholder() {
  return (
    <BoardLayout
      subtitle={" "}
      figures={
        <>
          <BandPlaceholder className="h-[54px] w-36" />
          <BandPlaceholder className="h-[54px] w-36" />
        </>
      }
      headings={STAGES.map((stage) => (
        <BandPlaceholder key={stage} className="h-[150px] rounded-[14px]" />
      ))}
      columns={STAGES.map((stage) => (
        <div key={stage} className="flex flex-col gap-2.5 p-1.5">
          <Placeholder className="h-[112px] rounded-xl" />
          <Placeholder className="h-[112px] rounded-xl" />
        </div>
      ))}
    />
  );
}
