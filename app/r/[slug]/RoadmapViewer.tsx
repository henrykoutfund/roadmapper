"use client";

import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node, Position } from "reactflow";
import { addMonths, differenceInCalendarMonths, startOfMonth } from "date-fns";
import "reactflow/dist/style.css";
import type { ItemRow, ProductRow } from "@/lib/roadmap/types";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function confidenceWeight(c: ItemRow["revenue_confidence"]) {
  if (c === "high") return 1;
  if (c === "medium") return 0.8;
  return 0.6;
}

function formatCompactNumber(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return `${Math.round(amount)}`;
}

function formatCompactCurrency(amount: number, currencySymbol: string) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${currencySymbol}${(amount / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${currencySymbol}${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${currencySymbol}${(amount / 1_000).toFixed(0)}k`;
  return `${currencySymbol}${Math.round(amount)}`;
}

export default function RoadmapViewer({ products, items }: { products: ProductRow[]; items: ItemRow[] }) {
  const timelineStart = useMemo(() => startOfMonth(new Date()), []);
  const timelineMonths = 12;
  const monthWidth = 180;
  const rowHeight = 120;
  const leftPadding = 240;
  const topPadding = 60;
  const nodeWidth = 210;
  const laneOffset = 22;
  const [drawer, setDrawer] = useState<{ type: "product"; id: string } | { type: "item"; id: string } | null>(null);

  const months = useMemo(() => {
    const list: Array<{ key: string; label: string; date: Date }> = [];
    for (let i = 0; i < timelineMonths; i += 1) {
      const d = addMonths(timelineStart, i);
      list.push({
        key: monthKey(d),
        label: d.toLocaleString(undefined, { month: "short", year: "numeric" }),
        date: d,
      });
    }
    return list;
  }, [timelineStart]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const productColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.color);
    return map;
  }, [products]);

  const itemX = useMemo(() => {
    return (it: ItemRow) => {
      const anchor = it.end_date ? startOfMonth(new Date(it.end_date)) : it.start_date ? startOfMonth(new Date(it.start_date)) : null;
      return (
        it.position_x ??
        (anchor
          ? leftPadding + clamp(differenceInCalendarMonths(anchor, timelineStart), 0, 36) * monthWidth
          : leftPadding)
      );
    };
  }, [leftPadding, monthWidth, timelineStart]);

  const xForMonth = useMemo(() => {
    return (d: Date) => leftPadding + clamp(differenceInCalendarMonths(startOfMonth(d), timelineStart), 0, 36) * monthWidth;
  }, [leftPadding, monthWidth, timelineStart]);

  const tubeLanes = useMemo(() => {
    const byProduct = new Map<string, ItemRow[]>();
    for (const it of items) {
      const list = byProduct.get(it.product_id);
      if (list) list.push(it);
      else byProduct.set(it.product_id, [it]);
    }

    const opacityForStatus = (status: string) => {
      if (status === "in_progress") return 0.9;
      if (status === "planned") return 0.55;
      if (status === "done") return 0.22;
      if (status === "on_hold") return 0.22;
      return 0.35;
    };

    return products.map((p, idx) => {
      const list = byProduct.get(p.id) ?? [];
      const intervals = list
        .map((it) => {
          const start =
            it.start_date != null
              ? new Date(it.start_date)
              : it.status === "in_progress"
                ? timelineStart
                : it.end_date != null
                  ? new Date(it.end_date)
                  : null;
          const end = it.end_date != null ? new Date(it.end_date) : it.start_date != null ? new Date(it.start_date) : null;
          if (!start || !end) return null;

          const startX = xForMonth(start);
          const endX = xForMonth(end) + nodeWidth / 2;
          const left = Math.min(startX, endX);
          const right = Math.max(startX, endX);

          return {
            id: it.id,
            startX: left,
            left,
            right,
            opacity: opacityForStatus(it.status),
          };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .sort((a, b) => a.left - b.left);

      const lanes: Array<Array<{ id: string; left: number; right: number; startX: number; opacity: number; attachLane: number }>> =
        [];
      const lastRightByLane: number[] = [];

      for (const seg of intervals) {
        let lane = lastRightByLane.findIndex((r) => seg.left >= r);
        if (lane === -1) lane = lastRightByLane.length;

        const attachLane = (() => {
          if (lane === 0) return 0;
          for (let a = 0; a < lane; a += 1) {
            const prev = lanes[a];
            const hit = prev?.some((s) => s.left <= seg.startX && seg.startX <= s.right);
            if (hit) return a;
          }
          return 0;
        })();

        if (!lanes[lane]) lanes[lane] = [];
        lanes[lane].push({ ...seg, attachLane });
        lastRightByLane[lane] = seg.right;
      }

      return {
        productId: p.id,
        baseY: topPadding + idx * rowHeight + 70,
        lanes,
      };
    });
  }, [items, nodeWidth, products, rowHeight, timelineStart, topPadding, xForMonth]);

  const revenueSeries = useMemo(() => {
    const lowAdds = new Array<number>(timelineMonths).fill(0);
    const highAdds = new Array<number>(timelineMonths).fill(0);

    const currency = items.find((it) => it.revenue_currency)?.revenue_currency ?? "£";

    for (const it of items) {
      const d = it.end_date ?? it.start_date;
      if (!d) continue;
      if (it.revenue_low == null && it.revenue_high == null) continue;

      const idx = clamp(differenceInCalendarMonths(startOfMonth(new Date(d)), timelineStart), 0, timelineMonths - 1);
      const w = confidenceWeight(it.revenue_confidence);

      const low = (it.revenue_low ?? 0) * w;
      const high = (it.revenue_high ?? it.revenue_low ?? 0) * w;

      lowAdds[idx] += low;
      highAdds[idx] += Math.max(high, low);
    }

    const lowCum: number[] = [];
    const highCum: number[] = [];
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < timelineMonths; i += 1) {
      lo += lowAdds[i];
      hi += highAdds[i];
      lowCum.push(lo);
      highCum.push(hi);
    }

    return { currency, lowCum, highCum };
  }, [items, timelineMonths, timelineStart]);

  const headlineMetrics = useMemo(() => {
    const currency = revenueSeries.currency;
    const lowTotal = revenueSeries.lowCum[revenueSeries.lowCum.length - 1] ?? 0;
    const highTotal = revenueSeries.highCum[revenueSeries.highCum.length - 1] ?? 0;
    const mid = (lowTotal + highTotal) / 2;

    const publicItemCount = items.length;
    const productCount = products.length;

    const nextMilestone = items
      .filter((it) => it.end_date || it.start_date)
      .map((it) => ({ it, d: new Date(it.end_date ?? it.start_date ?? new Date().toISOString()) }))
      .sort((a, b) => a.d.getTime() - b.d.getTime())[0]?.it;

    const nextLabel = nextMilestone?.title ?? "—";

    return {
      currency,
      lowTotal,
      highTotal,
      mid,
      publicItemCount,
      productCount,
      nextLabel,
    };
  }, [items, products.length, revenueSeries]);

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
      const anchor = it.end_date ? startOfMonth(new Date(it.end_date)) : it.start_date ? startOfMonth(new Date(it.start_date)) : null;
      const x =
        it.position_x ??
        (anchor
          ? leftPadding + clamp(differenceInCalendarMonths(anchor, timelineStart), 0, 36) * monthWidth
          : leftPadding);
      const y = it.position_y ?? topPadding + idx * rowHeight;

      const rev = (() => {
        if (it.revenue_low == null && it.revenue_high == null) return "—";
        const currency = it.revenue_currency ?? revenueSeries.currency;
        const low = it.revenue_low ?? null;
        const high = it.revenue_high ?? null;
        if (low == null && high == null) return "—";
        const lo = low ?? high ?? 0;
        const hi = high ?? low ?? 0;
        const range = `${currency}${formatCompactNumber(lo)}–${formatCompactNumber(hi)}`;
        const c =
          it.revenue_confidence === "high" ? "high" : it.revenue_confidence === "medium" ? "med" : "low";
        return `${range} (${c})`;
      })();

      const productColor = productById.get(it.product_id)?.color ?? "#0ea5e9";
      const statusLabel =
        it.status === "in_progress"
          ? "In progress"
          : it.status === "done"
            ? "Shipped"
            : it.status === "on_hold"
              ? "On hold"
              : "Planned";

      return {
        id: it.id,
        draggable: false,
        selectable: false,
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div className="grid gap-1">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold leading-5 text-zinc-950">
                  <div className="line-clamp-2">{it.title}</div>
                </div>
                <div className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                  {statusLabel}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 text-xs text-zinc-600">
                <div className="truncate">{rev}</div>
                <div className="text-[11px] font-medium text-zinc-400">ⓘ</div>
              </div>
            </div>
          ),
        },
        style: {
          width: 210,
          borderRadius: 18,
          border: "1px solid rgb(228 228 231)",
          background: "rgba(255,255,255,0.92)",
          padding: 10,
          pointerEvents: "auto",
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          backdropFilter: "blur(6px)",
          borderLeft: `6px solid ${productColor}`,
          maxHeight: 140,
          overflow: "hidden",
        },
        type: "default",
      };
    });
  }, [items, leftPadding, monthWidth, productById, products, revenueSeries.currency, timelineStart]);

  const edges = useMemo<Edge[]>(() => {
    return [];
  }, []);

  const chart = useMemo(() => {
    const w = 720;
    const h = 140;
    const padX = 12;
    const padY = 12;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;

    const max = Math.max(...revenueSeries.highCum, 1);
    const pointsLow = revenueSeries.lowCum.map((v, i) => {
      const x = padX + (i / Math.max(timelineMonths - 1, 1)) * innerW;
      const y = padY + (1 - v / max) * innerH;
      return { x, y };
    });
    const pointsHigh = revenueSeries.highCum.map((v, i) => {
      const x = padX + (i / Math.max(timelineMonths - 1, 1)) * innerW;
      const y = padY + (1 - v / max) * innerH;
      return { x, y };
    });

    const linePath = pointsHigh
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const bandPath = [
      ...pointsHigh.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
      ...pointsLow
        .slice()
        .reverse()
        .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
      "Z",
    ].join(" ");

    return { w, h, linePath, bandPath };
  }, [revenueSeries, timelineMonths]);

  const selectedItem = useMemo(() => {
    if (!drawer || drawer.type !== "item") return null;
    return items.find((it) => it.id === drawer.id) ?? null;
  }, [drawer, items]);

  const selectedProduct = useMemo(() => {
    if (!drawer || drawer.type !== "product") return null;
    return productById.get(drawer.id) ?? null;
  }, [drawer, productById]);

  const selectedProductItems = useMemo(() => {
    if (!selectedProduct) return [];
    return items
      .filter((it) => it.product_id === selectedProduct.id)
      .slice()
      .sort((a, b) => itemX(a) - itemX(b));
  }, [itemX, items, selectedProduct]);

  const selectedRange = useMemo(() => {
    const list =
      drawer?.type === "product"
        ? selectedProductItems
        : drawer?.type === "item" && selectedItem
          ? [selectedItem]
          : [];

    const currency = list.find((it) => it.revenue_currency)?.revenue_currency ?? revenueSeries.currency;
    let low = 0;
    let high = 0;
    for (const it of list) {
      if (it.revenue_low == null && it.revenue_high == null) continue;
      const w = confidenceWeight(it.revenue_confidence);
      const lo = (it.revenue_low ?? 0) * w;
      const hi = (it.revenue_high ?? it.revenue_low ?? 0) * w;
      low += lo;
      high += Math.max(hi, lo);
    }
    return { currency, low, high };
  }, [drawer, revenueSeries.currency, selectedItem, selectedProductItems]);

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid gap-6 lg:grid-cols-[1fr_740px] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Outfund_ViceVersa · Roadmap
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Where we’re going next
            </div>
            <div className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              A high-level view of planned product work and its potential revenue unlock over time.
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-medium text-zinc-500">Cumulative unlock (12m)</div>
                <div className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatCompactCurrency(headlineMetrics.lowTotal, headlineMetrics.currency)}–{formatCompactCurrency(headlineMetrics.highTotal, headlineMetrics.currency)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Midpoint: {formatCompactCurrency(headlineMetrics.mid, headlineMetrics.currency)}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-medium text-zinc-500">Public initiatives</div>
                <div className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {headlineMetrics.publicItemCount}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Across {headlineMetrics.productCount} product lines</div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-medium text-zinc-500">Next milestone</div>
                <div className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
                  {headlineMetrics.nextLabel}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Based on earliest dated item</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Cumulative revenue unlock
              </div>
              <div className="text-xs font-medium text-zinc-500">Confidence-weighted range</div>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <svg width="100%" height={chart.h} viewBox={`0 0 ${chart.w} ${chart.h}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59,130,246,0.30)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.05)" />
                  </linearGradient>
                </defs>
                <path d={chart.bandPath} fill="url(#band)" />
                <path d={chart.linePath} fill="none" stroke="rgba(37,99,235,0.85)" strokeWidth="2.5" />
              </svg>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-zinc-500">
              {months.map((m, idx) => (
                <div key={m.key} className="truncate">
                  {idx % 3 === 0 ? m.label : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Tube map</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            {products.map((p) => (
              <button
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                onClick={() => setDrawer({ type: "product", id: p.id })}
                type="button"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-[720px] overflow-auto bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
          <div
            className="absolute left-0 top-0"
            style={{
              width: leftPadding + monthWidth * timelineMonths + 280,
              height: topPadding + rowHeight * tubeRows.length + 220,
            }}
          >
            <div className="sticky top-0 z-10 flex bg-white/80 backdrop-blur dark:bg-zinc-950/70">
              <div style={{ width: leftPadding }} />
              {months.map((m) => (
                <div
                  key={m.key}
                  className="border-l border-zinc-100 py-3 text-center text-xs font-medium text-zinc-500 dark:border-zinc-900 dark:text-zinc-500"
                  style={{ width: monthWidth }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {tubeRows.map((r) => (
              <div key={r.product.id} className="absolute left-0 right-0" style={{ top: r.y + 42 }}>
                <button
                  className="absolute left-0 top-0 flex items-center gap-3 pl-6 text-left"
                  style={{ width: leftPadding }}
                  onClick={() => setDrawer({ type: "product", id: r.product.id })}
                  type="button"
                >
                  <div className="h-3 w-3 rounded-full" style={{ background: r.product.color }} />
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{r.product.name}</div>
                </button>
              </div>
            ))}

            {tubeLanes.map((row) => {
              const productColor = productColorById.get(row.productId) ?? "#0ea5e9";
              return (
                <div key={row.productId} className="absolute left-0 right-0" style={{ top: row.baseY }}>
                  {row.lanes.map((lane, laneIdx) => {
                    const y = laneIdx * laneOffset;
                    return (
                      <div key={`${row.productId}-lane-${laneIdx}`} className="absolute left-0 right-0" style={{ top: y }}>
                        {laneIdx > 0
                          ? lane.map((s) => (
                              <div
                                key={`c-${s.id}`}
                                className="absolute rounded-full"
                                style={{
                                  left: s.startX,
                                  width: 12,
                                  height: Math.max(12, laneIdx - s.attachLane) * laneOffset,
                                  top: -((laneIdx - s.attachLane) * laneOffset),
                                  background: productColor,
                                  opacity: Math.min(0.7, s.opacity),
                                  filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.08))",
                                }}
                              />
                            ))
                          : null}
                        {lane.map((s) => (
                          <div
                            key={s.id}
                            className="absolute rounded-full"
                            style={{
                              left: s.left,
                              width: Math.max(10, s.right - s.left),
                              height: 12,
                              transform: "translateY(-50%)",
                              background: productColor,
                              opacity: s.opacity,
                              filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.12))",
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div className="absolute left-0 top-0 right-0 bottom-0">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView={false}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={false}
                panOnScroll={false}
                selectionOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                onNodeClick={(_, n) => setDrawer({ type: "item", id: n.id })}
              >
                <Background gap={28} size={1} color="rgba(0,0,0,0.06)" />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>

      {drawer ? (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setDrawer(null)}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-auto bg-white shadow-2xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-500">
                    {drawer.type === "product" ? "Product" : "Initiative"}
                  </div>
                  <div className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {drawer.type === "product"
                      ? selectedProduct?.name ?? "—"
                      : selectedItem?.title ?? "—"}
                  </div>
                </div>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-200 px-3 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => setDrawer(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-xs font-medium text-zinc-500">Confidence-weighted unlock</div>
                <div className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatCompactCurrency(selectedRange.low, selectedRange.currency)}–{formatCompactCurrency(selectedRange.high, selectedRange.currency)}
                </div>
              </div>

              {drawer.type === "product" ? (
                <div className="mt-5 grid gap-4">
                  {selectedProduct?.public_description ? (
                    <div className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                      {selectedProduct.public_description}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      No product description yet.
                    </div>
                  )}

                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Initiatives
                  </div>
                  <div className="grid gap-2">
                    {selectedProductItems.length ? (
                      selectedProductItems.map((it) => (
                        <button
                          key={it.id}
                          className="rounded-xl border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                          onClick={() => setDrawer({ type: "item", id: it.id })}
                          type="button"
                        >
                          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{it.title}</div>
                          {it.public_summary ? (
                            <div className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                              {it.public_summary}
                            </div>
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">No initiatives yet.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    {selectedItem ? (productById.get(selectedItem.product_id)?.name ?? "—") : "—"}
                  </div>

                  {selectedItem?.public_summary ? (
                    <div className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                      {selectedItem.public_summary}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      No description yet.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="text-xs font-medium text-zinc-500">Status</div>
                      <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                        {selectedItem?.status ?? "—"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="text-xs font-medium text-zinc-500">Timing</div>
                      <div className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
                        {selectedItem?.start_date ?? "—"}
                        {selectedItem?.end_date ? ` → ${selectedItem.end_date}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
