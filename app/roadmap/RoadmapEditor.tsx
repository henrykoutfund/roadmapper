"use client";

import { useCallback, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Node, type NodeChange, type OnNodesChange } from "reactflow";
import { addMonths, differenceInCalendarMonths, startOfMonth } from "date-fns";
import "reactflow/dist/style.css";
import { createClient } from "@/lib/supabase/browser";
import type { ItemRow, ProductRow } from "@/lib/roadmap/types";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function RoadmapEditor({
  roadmapId,
  products,
  items: initialItems,
}: {
  roadmapId: string;
  products: ProductRow[];
  items: ItemRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [newStartMonth, setNewStartMonth] = useState(monthKey(new Date()));
  const [newEndMonth, setNewEndMonth] = useState<string>("");
  const [newRevenueLow, setNewRevenueLow] = useState<string>("");
  const [newRevenueHigh, setNewRevenueHigh] = useState<string>("");
  const [newConfidence, setNewConfidence] = useState<"low" | "medium" | "high">("medium");
  const [newImpactScore, setNewImpactScore] = useState<string>("");
  const [error, setError] = useState<string>("");

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
          ? `${it.revenue_currency} ${it.revenue_low ?? "?"}–${it.revenue_high ?? "?"}`
          : "—";

      return {
        id: it.id,
        position: { x, y },
        data: {
          title: it.title,
          rev,
          conf: it.revenue_confidence,
          status: it.status,
        },
        style: {
          width: 260,
          borderRadius: 16,
          border: "1px solid rgb(228 228 231)",
          background: "white",
          padding: 12,
        },
      };
    });
  }, [items, leftPadding, monthWidth, products, timelineStart]);

  const onNodesChange = useCallback<OnNodesChange>(
    async (changes: NodeChange[]) => {
      if (!supabase) return;
      const positionChanges = changes.filter((c) => c.type === "position" && c.dragging === false) as Array<
        NodeChange & { type: "position"; position?: { x: number; y: number } }
      >;

      if (positionChanges.length === 0) return;

      const updates = positionChanges
        .map((c) => {
          if (!("id" in c) || !c.position) return null;
          return { id: c.id, position_x: Math.round(c.position.x), position_y: Math.round(c.position.y) };
        })
        .filter(Boolean) as Array<{ id: string; position_x: number; position_y: number }>;

      if (updates.length === 0) return;

      setItems((prev) =>
        prev.map((it) => {
          const upd = updates.find((u) => u.id === it.id);
          return upd ? { ...it, position_x: upd.position_x, position_y: upd.position_y } : it;
        }),
      );

      for (const upd of updates) {
        const { error: updateError } = await supabase.from("roadmap_items").update(upd).eq("id", upd.id);
        if (updateError) {
          setError(updateError.message);
        }
      }
    },
    [supabase],
  );

  const onCreateItem = async () => {
    if (!supabase) {
      setError("Supabase env vars are missing in the client.");
      return;
    }

    if (!selectedProductId) {
      setError("Create a product first.");
      return;
    }

    const start = newStartMonth ? `${newStartMonth}-01` : null;
    const end = newEndMonth ? `${newEndMonth}-01` : null;

    const revenueLow = newRevenueLow.trim() ? Number(newRevenueLow) : null;
    const revenueHigh = newRevenueHigh.trim() ? Number(newRevenueHigh) : null;
    const impactScore = newImpactScore.trim() ? Number(newImpactScore) : null;

    const { data, error: insertError } = await supabase
      .from("roadmap_items")
      .insert({
        roadmap_id: roadmapId,
        product_id: selectedProductId,
        title: newTitle.trim() || "Untitled",
        status: "planned",
        time_mode: "fixed",
        start_date: start,
        end_date: end,
        revenue_low: revenueLow,
        revenue_high: revenueHigh,
        revenue_currency: "£",
        revenue_confidence: newConfidence,
        impact_score: impactScore,
        is_public: true,
      })
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setItems((prev) => [...prev, data as ItemRow]);
    setNewTitle("");
    setNewEndMonth("");
    setNewRevenueLow("");
    setNewRevenueHigh("");
    setNewImpactScore("");
    setError("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Add item</div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        {!products.length ? (
          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">No products yet.</div>
        ) : (
          <div className="mt-4 grid gap-3 text-sm">
            <label className="grid gap-1">
              <div className="text-zinc-600 dark:text-zinc-400">Product</div>
              <select
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <div className="text-zinc-600 dark:text-zinc-400">Title</div>
              <input
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Investor dashboard v1"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Start</div>
                <select
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newStartMonth}
                  onChange={(e) => setNewStartMonth(e.target.value)}
                >
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">End</div>
                <select
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newEndMonth}
                  onChange={(e) => setNewEndMonth(e.target.value)}
                >
                  <option value="">—</option>
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Revenue low</div>
                <input
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newRevenueLow}
                  onChange={(e) => setNewRevenueLow(e.target.value)}
                  inputMode="numeric"
                  placeholder="100000"
                />
              </label>
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Revenue high</div>
                <input
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newRevenueHigh}
                  onChange={(e) => setNewRevenueHigh(e.target.value)}
                  inputMode="numeric"
                  placeholder="300000"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Confidence</div>
                <select
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newConfidence}
                  onChange={(e) => setNewConfidence(e.target.value as "low" | "medium" | "high")}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Impact (1–10)</div>
                <input
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={newImpactScore}
                  onChange={(e) => setNewImpactScore(e.target.value)}
                  inputMode="numeric"
                  placeholder="7"
                />
              </label>
            </div>

            <button
              className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 disabled:opacity-50"
              onClick={onCreateItem}
              type="button"
              disabled={!supabase}
            >
              Create item
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 text-sm font-semibold text-zinc-950 dark:border-zinc-800 dark:text-zinc-50">
          Tube map (drag nodes)
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
              <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView={false} panOnScroll>
                <Background gap={24} size={1} color="rgba(0,0,0,0.06)" />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

