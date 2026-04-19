"use client";

import { useMemo } from "react";
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
  const leftPadding = 300;
  const topPadding = 60;

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
      const start = it.start_date ? startOfMonth(new Date(it.start_date)) : null;
      return (
        it.position_x ??
        (start
          ? leftPadding + clamp(differenceInCalendarMonths(start, timelineStart), 0, 36) * monthWidth
          : leftPadding)
      );
    };
  }, [leftPadding, monthWidth, timelineStart]);

  const productExtents = useMemo(() => {
    const map = new Map<string, { minX: number; maxX: number; count: number }>();
    for (const it of items) {
      const x = itemX(it);
      const cur = map.get(it.product_id);
      if (!cur) {
        map.set(it.product_id, { minX: x, maxX: x, count: 1 });
      } else {
        cur.minX = Math.min(cur.minX, x);
        cur.maxX = Math.max(cur.maxX, x);
        cur.count += 1;
      }
    }
    return map;
  }, [itemX, items]);

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
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold leading-5 text-zinc-950">{it.title}</div>
                <div className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                  {statusLabel}
                </div>
              </div>
              {it.public_summary ? (
                <div className="text-xs leading-5 text-zinc-600">{it.public_summary}</div>
              ) : null}
              <div className="flex items-center justify-between gap-3 pt-1 text-xs text-zinc-600">
                <div>{rev}</div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: productColor }} />
                  <span>{productById.get(it.product_id)?.name ?? "—"}</span>
                </div>
              </div>
            </div>
          ),
        },
        style: {
          width: 260,
          borderRadius: 18,
          border: "1px solid rgb(228 228 231)",
          background: "rgba(255,255,255,0.92)",
          padding: 12,
          pointerEvents: "none",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          backdropFilter: "blur(6px)",
          borderLeft: `6px solid ${productColor}`,
        },
        type: "default",
      };
    });
  }, [items, leftPadding, monthWidth, productById, products, timelineStart]);

  const edges = useMemo<Edge[]>(() => {
    const byProduct = new Map<string, ItemRow[]>();
    for (const it of items) {
      const list = byProduct.get(it.product_id);
      if (list) list.push(it);
      else byProduct.set(it.product_id, [it]);
    }

    const all: Edge[] = [];
    for (const [productId, list] of byProduct.entries()) {
      const color = productColorById.get(productId) ?? "#0ea5e9";
      const sorted = list.slice().sort((a, b) => itemX(a) - itemX(b));
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const a = sorted[i];
        const b = sorted[i + 1];
        all.push({
          id: `e-${a.id}-${b.id}`,
          source: a.id,
          target: b.id,
          type: "smoothstep",
          animated: a.status === "in_progress" || b.status === "in_progress",
          style: {
            stroke: color,
            strokeWidth: 12,
            strokeLinecap: "round",
            opacity: 0.8,
            filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.18))",
          },
        });
      }
    }
    return all;
  }, [itemX, items, productColorById]);

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
              <div key={p.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-[720px] overflow-auto bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
          <div
            className="absolute left-0 top-0"
            style={{
              width: leftPadding + monthWidth * timelineMonths + 400,
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
                <div
                  className="absolute left-0 top-0 flex items-center gap-3 pl-6"
                  style={{ width: leftPadding }}
                >
                  <div className="h-3 w-3 rounded-full" style={{ background: r.product.color }} />
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{r.product.name}</div>
                </div>
                {productExtents.get(r.product.id)?.count ? (
                  <>
                    <div
                      className="absolute h-[14px] rounded-full opacity-25"
                      style={{
                        left: Math.max(leftPadding, productExtents.get(r.product.id)!.minX - 40),
                        width:
                          productExtents.get(r.product.id)!.maxX -
                          productExtents.get(r.product.id)!.minX +
                          80,
                        background: r.product.color,
                        filter: "blur(8px)",
                      }}
                    />
                    <div
                      className="absolute h-[8px] rounded-full opacity-80"
                      style={{
                        left: Math.max(leftPadding, productExtents.get(r.product.id)!.minX - 40),
                        width:
                          productExtents.get(r.product.id)!.maxX -
                          productExtents.get(r.product.id)!.minX +
                          80,
                        background: r.product.color,
                        filter: "saturate(1.1)",
                        boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
                      }}
                    />
                  </>
                ) : (
                  <div
                    className="absolute h-[6px] rounded-full opacity-25"
                    style={{
                      left: leftPadding,
                      width: monthWidth * timelineMonths + 200,
                      background: `repeating-linear-gradient(90deg, ${r.product.color}, ${r.product.color} 10px, transparent 10px, transparent 18px)`,
                    }}
                  />
                )}
              </div>
            ))}

            <div className="absolute left-0 top-0 right-0 bottom-0">
              <ReactFlow nodes={nodes} edges={edges} fitView={false} panOnScroll nodesDraggable={false}>
                <Background gap={28} size={1} color="rgba(0,0,0,0.06)" />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
