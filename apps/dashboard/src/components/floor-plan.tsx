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
  free: "fill-white stroke-stone-400",
  reserved: "fill-amber-100 stroke-amber-500",
  seated: "fill-sky-100 stroke-sky-500",
  inactive: "fill-stone-100 stroke-stone-300",
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[{ id: "all" as const, name: t("tables.allAreas") }, ...areas].map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={areaFilter === a.id}
              onClick={() => setAreaFilter(a.id)}
              className={cn(
                "h-8 rounded-full px-3 text-sm font-medium transition-colors",
                areaFilter === a.id
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200",
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
          "w-full select-none rounded-2xl border border-stone-200 bg-[linear-gradient(to_right,#f0efeb_1px,transparent_1px),linear-gradient(to_bottom,#f0efeb_1px,transparent_1px)] bg-[size:5%_7.142%] bg-[#fbfaf8] shadow-card",
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
          // fit the guest name to the table width (roughly 1.1 units per character at size 2)
          const maxChars = Math.max(6, Math.floor(table.width / 1.15));
          const label =
            status.label && status.label.length > maxChars
              ? `${status.label.slice(0, maxChars - 1)}…`
              : status.label;
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
                  strokeWidth={selected ? 0.8 : 0.45}
                  className={cn(fills[status.tone], selected && "stroke-brand-600")}
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={table.width}
                  height={table.height}
                  rx={1.4}
                  strokeWidth={selected ? 0.8 : 0.45}
                  className={cn(fills[status.tone], selected && "stroke-brand-600")}
                />
              )}
              <text
                x={cx}
                y={label ? cy - 0.6 : cy + 1}
                textAnchor="middle"
                fontSize={2.6}
                fontWeight={700}
                className={cn(status.tone === "inactive" ? "fill-stone-400" : "fill-stone-800")}
              >
                {table.name}
              </text>
              {label ? (
                <text
                  x={cx}
                  y={cy + 2.6}
                  textAnchor="middle"
                  fontSize={2}
                  fontWeight={500}
                  className="fill-stone-700"
                >
                  {label}
                </text>
              ) : (
                <text
                  x={cx}
                  y={cy + 3.8}
                  textAnchor="middle"
                  fontSize={1.8}
                  className="fill-stone-500"
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
