import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { STAGES, columns as toColumns, type Move } from "../deals";
import type { Deal, Stage } from "../queries";
import { Column } from "./Column";
import { DealCardLifted, type PickUpListeners } from "./DealCard";

const CARD_GAP = 8;
const SETTLE_LIMIT_MS = 200;
const NO_DEAL = "no-deal";

// Enter stays free to open the deal, because dnd-kit would otherwise pick up on it.
const KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space"] };

/**
 * The column under the card, going by left and right only. A column's droppable
 * is as tall as all its cards, so distances that include height would favor
 * short columns over the long one the card is actually above.
 */
const columnUnderCard: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) => {
  const middle = collisionRect.left + collisionRect.width / 2;
  let closest: (typeof droppableContainers)[number] | null = null;
  let closestDistance = Infinity;
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const distance = Math.abs(rect.left + rect.width / 2 - middle);
    if (distance < closestDistance) {
      closest = container;
      closestDistance = distance;
    }
  }
  return closest ? [{ id: closest.id, data: { droppableContainer: closest, value: closestDistance } }] : [];
};

/** Up and down only: nothing on the board scrolls sideways. */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.2 }, acceleration: 14 };

type Slot = { id: number; top: number; height: number };
type Drop = { stage: Stage; beforeId: number | null; place: number };
type Point = { x: number; y: number };

/**
 * Measures once per column per drag, so moving the pointer never touches layout.
 * Offsets ignore transforms, so cards that have slid aside still measure where
 * they really are.
 */
function measureColumn(list: HTMLDivElement, skipId: number): Slot[] {
  const slots: Slot[] = [];
  for (const card of list.querySelectorAll<HTMLElement>("[data-deal-id]")) {
    const id = Number(card.dataset.dealId);
    if (id !== skipId) slots.push({ id, top: card.offsetTop, height: card.offsetHeight });
  }
  return slots;
}

/** A height in the column that drops a card at this place, well clear of any tie. */
function heightOfPlace(slots: Slot[], place: number): number {
  const middle = (slot: Slot) => slot.top + slot.height / 2;
  if (slots.length === 0) return 0;
  if (place <= 0) return slots[0].top;
  if (place >= slots.length) return slots[slots.length - 1].top + slots[slots.length - 1].height;
  return (middle(slots[place - 1]) + middle(slots[place])) / 2;
}

/** The first card whose middle is below y: the moved card goes just above it. */
function dropPoint(slots: Slot[], y: number): { beforeId: number | null; place: number } {
  let low = 0;
  let high = slots.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (slots[middle].top + slots[middle].height / 2 > y) high = middle;
    else low = middle + 1;
  }
  return { beforeId: slots[low]?.id ?? null, place: low };
}

/** A column's slots, measured the first time a drag needs them. */
function slotsIn(measured: Map<Stage, Slot[]>, stage: Stage, list: HTMLDivElement, skipId: number): Slot[] {
  let slots = measured.get(stage);
  if (!slots) {
    slots = measureColumn(list, skipId);
    measured.set(stage, slots);
  }
  return slots;
}

/** How far down a column's cards the middle of a rect is, counting any that are scrolled out of view. */
function heightInList(list: HTMLDivElement, rect: { top: number; height: number }): number {
  return rect.top + rect.height / 2 - list.getBoundingClientRect().top + list.scrollTop;
}

function stageOf(columns: Record<Stage, Deal[]>, dealId: number): Stage | undefined {
  return STAGES.find((stage) => columns[stage].some((deal) => deal.id === dealId));
}

/** The card below this one in its column, or null if it's the last. */
function idAfter(column: Deal[], dealId: number): number | null {
  return column[column.findIndex((deal) => deal.id === dealId) + 1]?.id ?? null;
}

type ColumnsProps = {
  columns: Record<Stage, Deal[]>;
  today: string;
  draggingId: number | null;
  draggingStage: Stage | null;
  landedId: number | null;
  landedStage: Stage | null;
  drop: Drop | null;
  step: number;
  onAdd: (stage: Stage) => void;
  listRef: (stage: Stage, element: HTMLDivElement | null) => void;
};

/** Sits inside DndContext, because useDraggable needs the sensors it provides. */
function Columns({
  columns,
  today,
  draggingId,
  draggingStage,
  landedId,
  landedStage,
  drop,
  step,
  onAdd,
  listRef,
}: ColumnsProps) {
  // One draggable for the whole board, pointed at a card as it's picked up. A hook
  // per card would make every card re-render each time the drag crosses a column,
  // which took 160ms at 500 deals.
  const [armedId, setArmedId] = useState<number | null>(null);
  const { listeners, setNodeRef } = useDraggable({ id: armedId ?? NO_DEAL, disabled: armedId === null });
  // Arming a card re-renders straight away, and the listeners to call are the
  // ones that render made for it.
  const listenersRef = useRef(listeners);
  useLayoutEffect(() => {
    listenersRef.current = listeners;
  }, [listeners]);

  // The same pair for every card, so the cards' memo holds.
  const pickUp = useMemo<PickUpListeners>(() => {
    function arm(card: HTMLElement) {
      flushSync(() => setArmedId(Number(card.dataset.dealId)));
      setNodeRef(card);
    }
    return {
      onPointerDown(event) {
        arm(event.currentTarget);
        listenersRef.current?.onPointerDown?.(event);
      },
      onKeyDown(event) {
        if (!KEYBOARD_CODES.start.includes(event.code)) return;
        arm(event.currentTarget);
        listenersRef.current?.onKeyDown?.(event);
      },
    };
  }, [setNodeRef]);

  // Columns never narrower than 180px, which still fit at 1280px with a scrollbar. Beside the Copilot's panel
  // there's less room, so the board scrolls sideways under the page header, which stays put. Its 20px edges
  // are margins, so a column that scrolls past them is cut off 20px from the panel, as at the window's left.
  return (
    <div
      data-dragging={draggingId !== null}
      className="mx-5 grid min-h-0 flex-1 grid-cols-[repeat(6,minmax(180px,1fr))] gap-2 overflow-x-auto pb-4"
    >
      {STAGES.map((stage) => (
        <Column
          key={stage}
          stage={stage}
          deals={columns[stage]}
          today={today}
          draggingId={draggingStage === stage ? draggingId : null}
          landedId={landedStage === stage ? landedId : null}
          place={drop?.stage === stage ? drop.place : null}
          step={draggingStage === stage || drop?.stage === stage ? step : 0}
          pickUp={pickUp}
          onAdd={onAdd}
          listRef={listRef}
        />
      ))}
    </div>
  );
}

type Props = {
  deals: Deal[];
  today: string;
  onMove: (move: Move) => void;
  onAdd: (stage: Stage) => void;
};

export function Board({ deals, today, onMove, onAdd }: Props) {
  const columns = useMemo(() => toColumns(deals), [deals]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [landedId, setLandedId] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [step, setStep] = useState(0);

  const dropRef = useRef<Drop | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lists = useRef(new Map<Stage, HTMLDivElement>());
  const slots = useRef(new Map<Stage, Slot[]>());

  const listRef = useCallback((stage: Stage, element: HTMLDivElement | null) => {
    if (element) lists.current.set(stage, element);
    else lists.current.delete(stage);
  }, []);

  // Read by the keyboard sensor, which keeps the options it started the drag with.
  const columnsRef = useRef(columns);
  useLayoutEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  /** One place up or down in the column the card is over. */
  const stepWithinColumn = useCallback((dealId: number, card: ClientRect, { x, y }: Point, direction: 1 | -1) => {
    const drop = dropRef.current;
    const stage = drop?.stage ?? stageOf(columnsRef.current, dealId);
    const list = stage ? lists.current.get(stage) : undefined;
    if (!stage || !list) return undefined;

    const measured = slotsIn(slots.current, stage, list, dealId);
    const beforeId = drop ? drop.beforeId : idAfter(columnsRef.current[stage], dealId);
    const place = beforeId === null ? measured.length : measured.findIndex((slot) => slot.id === beforeId);
    const target = Math.max(0, Math.min(measured.length, place + direction));
    return { x, y: y + heightOfPlace(measured, target) - heightInList(list, card) };
  }, []);

  /**
   * Up and down step between the places in a column, rather than by a fixed
   * distance, so one press always moves one place, however long the column is.
   * Left and right step one column across, staying at the same height.
   */
  const stepByPlace = useCallback<KeyboardCoordinateGetter>(
    (event, { active, currentCoordinates, context: { collisionRect } }) => {
      if (!collisionRect) return undefined;
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        const across = collisionRect.width + CARD_GAP;
        return { x: currentCoordinates.x + (event.code === "ArrowRight" ? across : -across), y: currentCoordinates.y };
      }
      if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return undefined;
      event.preventDefault();
      return stepWithinColumn(active as number, collisionRect, currentCoordinates, event.code === "ArrowDown" ? 1 : -1);
    },
    [stepWithinColumn],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Smooth scrolling would still be moving when the next arrow press measures the column.
    useSensor(KeyboardSensor, {
      coordinateGetter: stepByPlace,
      keyboardCodes: KEYBOARD_CODES,
      scrollBehavior: "auto",
    }),
  );

  const setDropState = useCallback((next: Drop | null) => {
    const current = dropRef.current;
    if (current?.stage === next?.stage && current?.beforeId === next?.beforeId) return;
    dropRef.current = next;
    setDrop(next);
  }, []);

  const finish = useCallback(() => {
    setDraggingId(null);
    setDropState(null);
    slots.current.clear();
  }, [setDropState]);

  /** Ends a landing that's still waiting for the new order. */
  const settle = useCallback(() => {
    if (settleTimer.current === null) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
    finish();
  }, [finish]);

  function handleDragStart({ active }: DragStartEvent) {
    settle();
    setDraggingId(active.id as number);
    slots.current.clear();
  }

  function findDrop({ active, over }: Pick<DragMoveEvent, "active" | "over">): Drop | null {
    const list = over ? lists.current.get(over.id as Stage) : undefined;
    const rect = active.rect.current.translated;
    if (!over || !list || !rect) return null;
    setStep(rect.height + CARD_GAP);
    const stage = over.id as Stage;
    const measured = slotsIn(slots.current, stage, list, active.id as number);
    return { stage, ...dropPoint(measured, heightInList(list, rect)) };
  }

  function handleDragMove(event: DragMoveEvent) {
    setDropState(findDrop(event));
  }

  function handleDragEnd(event: DragEndEvent) {
    // Worked out again here, because a quick flick can end before the last move
    // has been reported.
    const target = findDrop(event) ?? dropRef.current;
    const dealId = event.active.id as number;
    const deal = deals.find((item) => item.id === dealId);
    if (!target || !deal) return finish();

    if (deal.stage === target.stage && idAfter(columns[deal.stage], dealId) === target.beforeId) return finish();

    // The gap stays open until the new order arrives, a tick later. Closing it now
    // would show the card back in its old place for a frame.
    settleTimer.current = setTimeout(settle, SETTLE_LIMIT_MS);
    onMove({ dealId, stage: target.stage, beforeDealId: target.beforeId });
    setLandedId(dealId);
  }

  // The new order has arrived, so the gap the drop left open can close.
  useLayoutEffect(settle, [deals, settle]);

  useEffect(() => {
    if (landedId === null) return;
    const timer = setTimeout(() => setLandedId(null), 400);
    return () => clearTimeout(timer);
  }, [landedId]);

  const activeDeal = draggingId === null ? undefined : deals.find((deal) => deal.id === draggingId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnUnderCard}
      autoScroll={AUTO_SCROLL}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
    >
      <p id="board-instructions" className="sr-only">
        Press Space to pick up a deal, use the arrow keys to move it, and press Space to drop it. Press Enter to open
        it.
      </p>
      <Columns
        columns={columns}
        today={today}
        draggingId={draggingId}
        draggingStage={activeDeal?.stage ?? null}
        landedId={landedId}
        landedStage={deals.find((deal) => deal.id === landedId)?.stage ?? null}
        drop={drop}
        step={step}
        onAdd={onAdd}
        listRef={listRef}
      />
      <DragOverlay dropAnimation={null}>{activeDeal && <DealCardLifted deal={activeDeal} today={today} />}</DragOverlay>
    </DndContext>
  );
}
