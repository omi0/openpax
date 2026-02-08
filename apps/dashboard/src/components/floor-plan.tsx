import type { AreaDto, TableDto } from "@sitli/shared";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Plan units: tables live on a 100 × 70 canvas. */
export const PLAN_W = 100;
export const PLAN_H = 70;

export type TableTone = "free" | "reserved" | "seated" | "inactive";

export interface TableStatus {
  tone: TableTone;
  /** Second line under the table name, e.g. the guest. */
  label?: string;
  title?: string;
}

export interface Position {
  id: string;
  x: number;
  y: number;
}

const fills: Record<TableTone, string> = {
  free: "fill-white stroke-zinc-400",
  reserved: "fill-amber-100 stroke-amber-500",
  seated: "fill-blue-100 stroke-blue-500",
  inactive: "fill-zinc-100 stroke-zinc-300",
};

/**
 * SVG floor plan. Read-only by default; with `onMove` tables can be dragged
 * and the new positions are reported on pointer up.
 */
export function FloorPlan({
  tables,
  areas,
  statusOf,
  onMove,
  onSelect,
  selectedId,
  className,
}: {
  tables: TableDto[];
  areas: AreaDto[];
  statusOf?: (table: TableDto) => TableStatus;
  onMove?: (positions: Position[]) => void;
  onSelect?: (table: TableDto) => void;
  selectedId?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [areaFilter, setAreaFilter] = useState<string | "all">("all");
  const [drag, setDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    x: number;
    y: number;
  } | null>(null);

  const visible = tables.filter((x) => areaFilter === "all" || x.areaId === areaFilter);
  const toUnits = (e: ReactPointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * PLAN_W,
      y: ((e.clientY - rect.top) / rect.height) * PLAN_H,
    };
  };

  const down = (e: ReactPointerEvent, table: TableDto) => {
    if (!onMove) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toUnits(e);
    setDrag({
      id: table.id,
      startX: p.x,
      startY: p.y,
      originX: table.x,
      originY: table.y,
      x: table.x,
      y: table.y,
    });
  };
  const move = (e: ReactPointerEvent, table: TableDto) => {
    if (!drag || drag.id !== table.id) return;
    const p = toUnits(e);
    const x = Math.max(0, Math.min(PLAN_W - table.width, drag.originX + p.x - drag.startX));
    const y = Math.max(0, Math.min(PLAN_H - table.height, drag.originY + p.y - drag.startY));
    setDrag({ ...drag, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });
  };
  const up = (table: TableDto) => {
    if (!drag || drag.id !== table.id) return;
    const moved = drag.x !== table.x || drag.y !== table.y;
    setDrag(null);
    if (moved) onMove?.([{ id: table.id, x: drag.x, y: drag.y }]);
    else onSelect?.(table);
  };

  return (
    <div className={className}>
      {areas.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {[{ id: "all" as const, name: t("tables.allAreas") }, ...areas].map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAreaFilter(a.id)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs",
                areaFilter === a.id
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
              )}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
        className={cn(
          "w-full select-none rounded-xl border border-zinc-200 bg-[linear-gradient(to_right,#f4f4f5_1px,transparent_1px),linear-gradient(to_bottom,#f4f4f5_1px,transparent_1px)] bg-[size:5%_7.142%] bg-white",
          onMove && "touch-none",
        )}
        role="img"
        aria-label={t("tables.floorPlan")}
      >
        {visible.map((table) => {
          const dragging = drag?.id === table.id;
          const x = dragging ? drag.x : table.x;
          const y = dragging ? drag.y : table.y;
          const status = statusOf?.(table) ?? { tone: table.active ? "free" : "inactive" };
          const cx = x + table.width / 2;
          const cy = y + table.height / 2;
          const selected = selectedId === table.id;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: drag surface; the list below the plan exposes the same actions
            <g
              key={table.id}
              onPointerDown={(e) => down(e, table)}
              onPointerMove={(e) => move(e, table)}
              onPointerUp={() => up(table)}
              onClick={() => {
                if (!onMove) onSelect?.(table);
              }}
              className={cn(onMove ? "cursor-move" : onSelect ? "cursor-pointer" : "")}
            >
              <title>
                {status.title ?? `${table.name} · ${table.minCovers}–${table.maxCovers}`}
              </title>
              {table.shape === "round" ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={table.width / 2}
                  ry={table.height / 2}
                  strokeWidth={selected ? 0.8 : 0.4}
                  className={cn(fills[status.tone], selected && "stroke-brand")}
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={table.width}
                  height={table.height}
                  rx={1.2}
                  strokeWidth={selected ? 0.8 : 0.4}
                  className={cn(fills[status.tone], selected && "stroke-brand")}
                />
              )}
              <text
                x={cx}
                y={status.label ? cy - 0.6 : cy + 1}
                textAnchor="middle"
                fontSize={2.6}
                fontWeight={600}
                className="fill-zinc-800"
              >
                {table.name}
              </text>
              {status.label ? (
                <text
                  x={cx}
                  y={cy + 2.6}
                  textAnchor="middle"
                  fontSize={2}
                  className="fill-zinc-600"
                >
                  {status.label.length > 14 ? `${status.label.slice(0, 13)}…` : status.label}
                </text>
              ) : (
                <text
                  x={cx}
                  y={cy + 3.8}
                  textAnchor="middle"
                  fontSize={1.8}
                  className="fill-zinc-500"
                >
                  {table.maxCovers}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
