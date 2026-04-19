"use client";

import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Node } from "reactflow";
import { addMonths, differenceInCalendarMonths, startOfMonth } from "date-fns";
import "reactflow/dist/style.css";
import type { ItemRow, ProductRow } from "@/lib/roadmap/types";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function RoadmapViewer({ products, items }: { products: ProductRow[]; items: ItemRow[] }) {
  const timelineStart = useMemo(() => startOfMonth(new Date()), []);
  const timelineMonths = 12;
  const monthWidth = 180;
  const rowHeight = 120;
  const leftPadding = 220;
  const topPadding = 60;

  const months = useMemo(() => {
    const list: Array<{ key: string; label: string }> = [];
    for (let i = 0; i < timelineMonths; i += 1) {
      const d = addMonths(timelineStart, i);
      list.push({ key: monthKey(d), label: d.toLocaleString(undefined, { month: "short", year: "numeric" }) });
    }
    return list;
  }, [timelineStart]);

  const tubeRows = useMemo(() => {
    return products.map((p, idx) => ({
      product: p,
      y: topPadding + idx * rowHeight,
    }));
  }, [products]);

  const nodes = useMemo<Node[]>(() => {
    const productIndex = new Map(products.map((p, idx) => [p.id, idx] as const));
    return items.map((it) => {
      const idx = productIndex.get(it.product_id) ?? 0;
      const start = it.start_date ? startOfMonth(new Date(it.start_date)) : null;
      const x =
        it.position_x ??
        (start
          ? leftPadding + clamp(differenceInCalendarMonths(start, timelineStart), 0, 36) * monthWidth
          : leftPadding);
      const y = it.position_y ?? topPadding + idx * rowHeight;

      const rev =
        it.revenue_low != null || it.revenue_high != null
          ? `${it.revenue_currency} ${it.revenue_low ?? "?"}–${it.revenue_high ?? "?"} (${it.revenue_confidence})`
          : "—";

      return {
        id: it.id,
        draggable: false,
        selectable: false,
        position: { x, y },
        data: {
          label: (
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-zinc-950">{it.title}</div>
              {it.public_summary ? (
                <div className="text-xs leading-5 text-zinc-600">{it.public_summary}</div>
              ) : null}
              <div className="text-xs text-zinc-600">{rev}</div>
            </div>
          ),
        },
        style: {
          width: 260,
          borderRadius: 16,
          border: "1px solid rgb(228 228 231)",
          background: "white",
          padding: 12,
          pointerEvents: "none",
        },
        type: "default",
      };
    });
  }, [items, leftPadding, monthWidth, products, timelineStart]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 text-sm font-semibold text-zinc-950 dark:border-zinc-800 dark:text-zinc-50">
        Roadmap
      </div>

      <div className="relative h-[680px] overflow-auto">
        <div
          className="absolute left-0 top-0"
          style={{
            width: leftPadding + monthWidth * timelineMonths + 400,
            height: topPadding + rowHeight * tubeRows.length + 200,
          }}
        >
          <div className="absolute left-0 top-0 right-0 flex">
            <div style={{ width: leftPadding }} />
            {months.map((m) => (
              <div
                key={m.key}
                className="border-l border-zinc-100 py-3 text-center text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-500"
                style={{ width: monthWidth }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {tubeRows.map((r) => (
            <div key={r.product.id} className="absolute left-0 right-0" style={{ top: r.y + 34 }}>
              <div className="absolute left-0 top-0 flex items-center gap-3" style={{ width: leftPadding }}>
                <div className="h-3 w-3 rounded-full" style={{ background: r.product.color }} />
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{r.product.name}</div>
              </div>
              <div
                className="absolute h-[6px] rounded-full opacity-70"
                style={{
                  left: leftPadding,
                  width: monthWidth * timelineMonths + 200,
                  background: r.product.color,
                }}
              />
            </div>
          ))}

          <div className="absolute left-0 top-0 right-0 bottom-0">
            <ReactFlow nodes={nodes} edges={[]} fitView={false} panOnScroll nodesDraggable={false}>
              <Background gap={24} size={1} color="rgba(0,0,0,0.06)" />
              <Controls />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}
