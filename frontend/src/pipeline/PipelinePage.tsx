import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  closestCenter,
  closestCorners,
  DndContext,
  getFirstCollision,
  pointerWithin,
  type CollisionDetection,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus, Search } from "lucide-react";
import { useDeals, type DealRow } from "../deals/hooks";
import { DealForm } from "../deals/DealForm";
import { money, plural } from "../shared/format";
import { LoadError, Loading } from "../shared/Loading";
import { PageHeader } from "../shared/PageHeader";
import { SidePanel } from "../shared/SidePanel";
import { STAGES, stageLabel, type Stage } from "../shared/stages";
import { boardTotals, buildColumns, isNoMove, matches, moveFrom, totals, type Columns } from "./board";
import { Column } from "./Column";
import { DealCard } from "./DealCard";
import { useMoveDeal } from "./hooks";

const isStage = (id: UniqueIdentifier): id is Stage => typeof id === "string";

function columnOf(columns: Columns, id: UniqueIdentifier): Stage | null {
  if (isStage(id)) return id;
  return (Object.keys(columns) as Stage[]).find((stage) => columns[stage].includes(id as number)) ?? null;
}

/** P1 to P8: the deals as cards, one column per stage, moved by mouse or keyboard. */
export function PipelinePage() {
  const navigate = useNavigate();
  const query = useDeals();
  const move = useMoveDeal();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<Stage | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const closeAdd = useCallback(() => setAdding(null), []);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const justChangedColumn = useRef(false);

  const deals = useMemo(() => query.data?.items ?? [], [query.data]);
  const byId = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const visible = useMemo(() => deals.filter((d) => matches(d, search)), [deals, search]);
  const serverColumns = useMemo(() => buildColumns(visible), [visible]);
  const columns = dragColumns ?? serverColumns;
  const board = boardTotals(deals);

  // After a card changes column the layout shifts under the pointer; keep the last
  // target for a frame so the card doesn't flip back and forth (dnd-kit's own pattern).
  useEffect(() => {
    requestAnimationFrame(() => {
      justChangedColumn.current = false;
    });
  }, [dragColumns]);

  /** With a mouse, what's under the pointer, cards before columns; with the keyboard, the nearest. */
  const collision: CollisionDetection = useCallback(
    (args) => {
      // A mouse in the gap between columns keeps its last target; guessing the nearest
      // there flips the card between two columns as the layout moves.
      const under = pointerWithin(args);
      const hits = under.length ? under : args.pointerCoordinates ? [] : closestCorners(args);
      let overId = getFirstCollision(hits, "id");
      if (overId != null) {
        if (isStage(overId) && dragColumns && dragColumns[overId].length > 0) {
          // Over a column with cards: the nearest card in it.
          const ids = new Set<UniqueIdentifier>(dragColumns[overId]);
          const nearest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) => ids.has(c.id)),
          });
          overId = nearest[0]?.id ?? overId;
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }
      if (justChangedColumn.current) lastOverId.current = activeId;
      return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
    },
    [activeId, dragColumns],
  );

  // The keyboard: left and right go to the top of the next column; up and down move within one.
  const placeRef = useRef({ columns: null as Columns | null, activeId: null as number | null });
  placeRef.current = { columns: dragColumns, activeId };
  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, args) => {
    const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
    const { columns: current, activeId: id } = placeRef.current;
    if (!step || !current || id === null) return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const from = columnOf(current, id);
    const order = STAGES.map((s) => s.key);
    const next = from ? order[order.indexOf(from) + step] : undefined;
    const rect = next ? args.context.droppableRects.get(next) : undefined;
    if (!rect) return args.currentCoordinates;
    return { x: rect.left, y: rect.top };
  }, []);

  const sensors = useSensors(
    // A short move starts a drag, so a click still opens the deal.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as number);
    setDragColumns(serverColumns);
  };

  // Moving over another column takes the card there, so its place shows as you drag.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragColumns) return;
    const from = columnOf(dragColumns, active.id);
    const to = columnOf(dragColumns, over.id);
    if (!from || !to || from === to) return;
    justChangedColumn.current = true;
    setDragColumns((current) => {
      if (!current) return current;
      const source = current[from].filter((id) => id !== active.id);
      const target = [...current[to]];
      const overIndex = isStage(over.id) ? target.length : target.indexOf(over.id as number);
      const below =
        over.rect && active.rect.current.translated
          ? active.rect.current.translated.top > over.rect.top + over.rect.height / 2
          : false;
      const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
      target.splice(index, 0, active.id as number);
      return { ...current, [from]: source, [to]: target };
    });
  };

  const finish = (finalColumns: Columns, id: number) => {
    setActiveId(null);
    setDragColumns(null);
    const result = moveFrom(finalColumns, id);
    // R6: one move at a time per card; a second drop waits for the first to save.
    if (!result || isNoMove(visible, result) || saving.has(id)) return;
    setSaving((s) => new Set(s).add(id));
    move.mutate(result, {
      onSettled: () =>
        setSaving((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragColumns ?? serverColumns;
    const id = active.id as number;
    if (!over) {
      setActiveId(null);
      setDragColumns(null);
      return;
    }
    const stage = columnOf(current, id);
    const overStage = columnOf(current, over.id);
    let finalColumns = current;
    if (stage && overStage === stage) {
      const ids = current[stage];
      const from = ids.indexOf(id);
      // Dropped on the column's empty space: to the bottom.
      const to = isStage(over.id) ? ids.length - 1 : ids.indexOf(over.id as number);
      if (from !== to) finalColumns = { ...current, [stage]: arrayMove(ids, from, to) };
    }
    finish(finalColumns, id);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setDragColumns(null);
  };

  const active = activeId !== null ? byId.get(activeId) : undefined;
  const openCount = board.count;

  return (
    <>
      <PageHeader
        title="Pipeline"
        summary={query.data ? `${plural(openCount, "open deal")}. Drag a card to change its stage.` : " "}
        action={
          <div className="board-sum" aria-label="Open pipeline totals">
            <div>
              <div className="lbl">Open pipeline</div>
              <div className="v" data-testid="board-value">
                {money(board.value)}
              </div>
            </div>
            <div>
              <div className="lbl">Expected revenue</div>
              <div className="v" data-testid="board-expected">
                {money(board.expected)}
              </div>
            </div>
          </div>
        }
      />
      <div className="toolbar">
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search deals</span>
          <input type="search" placeholder="Search deals" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={() => setAdding("new")}>
          <Plus size={16} aria-hidden="true" />
          Add deal
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadError error={query.error} what="pipeline" />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
          accessibility={{
            announcements: {
              onDragStart: ({ active: a }) => `Picked up ${byId.get(a.id as number)?.name}.`,
              onDragOver: ({ active: a, over }) =>
                over ? `${byId.get(a.id as number)?.name} is over ${dragColumns ? stageLabel(columnOf(dragColumns, over.id) ?? "new") : ""}.` : "",
              onDragEnd: ({ active: a, over }) =>
                over ? `Dropped ${byId.get(a.id as number)?.name} in ${stageLabel(columnOf(columns, a.id) ?? "new")}.` : "Move cancelled.",
              onDragCancel: () => "Move cancelled.",
            },
          }}
        >
          <div className="board">
            {STAGES.map((stage) => {
              const cards = columns[stage.key].map((id) => byId.get(id)).filter(Boolean) as DealRow[];
              const all = deals.filter((d) => d.stage === stage.key);
              return (
                <Column
                  key={stage.key}
                  stage={stage}
                  cards={cards}
                  totals={totals(search ? cards : all)}
                  activeId={activeId}
                  saving={saving}
                  onOpen={(deal) => navigate(`/deals/${deal.id}`)}
                  onAdd={() => setAdding(stage.key)}
                />
              );
            })}
          </div>
          <DragOverlay>{active ? <DealCard deal={active} className="overlay-card" /> : null}</DragOverlay>
        </DndContext>
      )}
      <SidePanel title="Add deal" open={adding !== null} onClose={closeAdd}>
        {adding !== null && <DealForm preset={{ stage: adding }} onSaved={closeAdd} onCancel={closeAdd} />}
      </SidePanel>
    </>
  );
}
