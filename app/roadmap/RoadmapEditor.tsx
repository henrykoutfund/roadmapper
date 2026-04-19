"use client";

import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodesChange,
  Position,
  type ReactFlowInstance,
} from "reactflow";
import { addMonths, differenceInCalendarMonths, startOfMonth } from "date-fns";
import "reactflow/dist/style.css";
import { createClient } from "@/lib/supabase/browser";
import type { ItemRow, ProductRow, RevenueConfidence, TimeMode } from "@/lib/roadmap/types";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function RoadmapEditor({
  roadmapId,
  products: initialProducts,
  items: initialItems,
}: {
  roadmapId: string;
  products: ProductRow[];
  items: ItemRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProducts[0]?.id ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [newStartMonth, setNewStartMonth] = useState(monthKey(new Date()));
  const [newEndMonth, setNewEndMonth] = useState<string>("");
  const [newRevenueLow, setNewRevenueLow] = useState<string>("");
  const [newRevenueHigh, setNewRevenueHigh] = useState<string>("");
  const [newConfidence, setNewConfidence] = useState<"low" | "medium" | "high">("medium");
  const [newImpactScore, setNewImpactScore] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<Partial<ItemRow>>({});
  const [productNameDrafts, setProductNameDrafts] = useState<Record<string, string>>({});
  const [newProductName, setNewProductName] = useState("");
  const [newProductColor, setNewProductColor] = useState("#2563eb");
  const [saving, setSaving] = useState(false);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const timelineStart = useMemo(() => startOfMonth(new Date()), []);
  const timelineMonths = 12;
  const monthWidth = 180;
  const rowHeight = 120;
  const leftPadding = 300;
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

  const productColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.color);
    return map;
  }, [products]);

  const itemX = useCallback(
    (it: ItemRow) => {
      const start = it.start_date ? startOfMonth(new Date(it.start_date)) : null;
      return (
        it.position_x ??
        (start
          ? leftPadding + clamp(differenceInCalendarMonths(start, timelineStart), 0, 36) * monthWidth
          : leftPadding)
      );
    },
    [leftPadding, monthWidth, timelineStart],
  );

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

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((it) => it.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

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

      const productColor = productColorById.get(it.product_id) ?? "#0ea5e9";

      return {
        id: it.id,
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-zinc-950">{it.title}</div>
              <div className="text-xs text-zinc-600">{rev}</div>
              <div className="text-[11px] text-zinc-500">
                {it.status}
                {it.is_public ? "" : " · internal"}
              </div>
            </div>
          ),
        },
        style: {
          width: 260,
          borderRadius: 16,
          border: it.id === selectedItemId ? "2px solid rgb(24 24 27)" : "1px solid rgb(228 228 231)",
          background: "white",
          padding: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.07)",
          borderLeft: `6px solid ${productColor}`,
        },
      };
    });
  }, [items, leftPadding, monthWidth, productColorById, products, selectedItemId, timelineStart]);

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
            strokeWidth: 10,
            strokeLinecap: "round",
            opacity: 0.85,
            filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.18))",
          },
        });
      }
    }
    return all;
  }, [itemX, items, productColorById]);

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

  const openItem = (id: string) => {
    const it = items.find((x) => x.id === id) ?? null;
    if (!it) return;
    setSelectedItemId(id);
    setItemDraft({
      id: it.id,
      product_id: it.product_id,
      title: it.title,
      status: it.status,
      time_mode: it.time_mode,
      start_date: it.start_date,
      end_date: it.end_date,
      revenue_low: it.revenue_low,
      revenue_high: it.revenue_high,
      revenue_currency: it.revenue_currency,
      revenue_confidence: it.revenue_confidence,
      impact_score: it.impact_score,
      is_public: it.is_public,
      description: it.description,
      public_summary: it.public_summary ?? null,
      internal_notes: it.internal_notes ?? null,
    });
  };

  const saveItem = async () => {
    if (!supabase) {
      setError("Supabase env vars are missing in the client.");
      return;
    }
    if (!selectedItemId) return;
    setSaving(true);
    setError("");

    const payload: Partial<ItemRow> = {
      product_id: itemDraft.product_id ?? selectedItem?.product_id,
      title: (itemDraft.title ?? selectedItem?.title ?? "").trim() || "Untitled",
      status: itemDraft.status ?? selectedItem?.status ?? "planned",
      time_mode: itemDraft.time_mode ?? selectedItem?.time_mode ?? "fixed",
      start_date: itemDraft.start_date ?? null,
      end_date: itemDraft.end_date ?? null,
      revenue_low: itemDraft.revenue_low ?? null,
      revenue_high: itemDraft.revenue_high ?? null,
      revenue_currency: (itemDraft.revenue_currency as string | undefined) ?? "£",
      revenue_confidence: (itemDraft.revenue_confidence as RevenueConfidence | undefined) ?? "medium",
      impact_score: itemDraft.impact_score ?? null,
      is_public: Boolean(itemDraft.is_public),
      description: itemDraft.description ?? null,
      public_summary: itemDraft.public_summary ?? null,
      internal_notes: itemDraft.internal_notes ?? null,
    };

    if (selectedItem && payload.product_id && payload.product_id !== selectedItem.product_id) {
      payload.position_y = null;
    }

    if (selectedItem && payload.start_date !== selectedItem.start_date) {
      payload.position_x = null;
    }

    if (payload.time_mode === "vague") {
      payload.start_date = null;
      payload.end_date = null;
    }

    const { error: updateError } = await supabase.from("roadmap_items").update(payload).eq("id", selectedItemId);
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === selectedItemId ? ({ ...it, ...payload } as ItemRow) : it)));
    setSaving(false);
  };

  const deleteItem = async () => {
    if (!supabase) return;
    if (!selectedItemId) return;
    if (!confirm("Delete this item?")) return;
    setSaving(true);
    const { error: delError } = await supabase.from("roadmap_items").delete().eq("id", selectedItemId);
    if (delError) {
      setSaving(false);
      setError(delError.message);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== selectedItemId));
    setSelectedItemId(null);
    setItemDraft({});
    setSaving(false);
  };

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
    if (rf) {
      requestAnimationFrame(() => {
        try {
          rf.fitView({ padding: 0.2, duration: 300 });
        } catch {}
      });
    }
  };

  const createProduct = async () => {
    if (!supabase) {
      setError("Supabase env vars are missing in the client.");
      return;
    }
    const name = newProductName.trim();
    if (!name) return;

    const maxSortOrder = products.reduce((m, p) => Math.max(m, p.sort_order), -1);

    const { data, error: insertError } = await supabase
      .from("roadmap_products")
      .insert({
        roadmap_id: roadmapId,
        name,
        color: newProductColor,
        sort_order: maxSortOrder + 1,
      })
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const p = data as ProductRow;
    setProducts((prev) => [...prev, p]);
    setSelectedProductId(p.id);
    setNewProductName("");
    setError("");
  };

  const saveProductName = async (productId: string) => {
    if (!supabase) return;
    const name = (productNameDrafts[productId] ?? "").trim();
    if (!name) return;
    const { error: updateError } = await supabase.from("roadmap_products").update({ name }).eq("id", productId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, name } : p)));
    setError("");
  };

  const setProductColor = async (productId: string, color: string) => {
    if (!supabase) return;
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, color } : p)));
    const { error: updateError } = await supabase.from("roadmap_products").update({ color }).eq("id", productId);
    if (updateError) {
      setError(updateError.message);
    }
  };

  const reorderProduct = async (productId: string, direction: "up" | "down") => {
    if (!supabase) return;
    const idx = products.findIndex((p) => p.id === productId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= products.length) return;

    const a = products[idx];
    const b = products[swapWith];
    const newA = { ...a, sort_order: b.sort_order };
    const newB = { ...b, sort_order: a.sort_order };
    const next = products.slice();
    next[idx] = newA;
    next[swapWith] = newB;
    next.sort((x, y) => x.sort_order - y.sort_order);
    setProducts(next);

    const [{ error: ea }, { error: eb }] = await Promise.all([
      supabase.from("roadmap_products").update({ sort_order: newA.sort_order }).eq("id", newA.id),
      supabase.from("roadmap_products").update({ sort_order: newB.sort_order }).eq("id", newB.id),
    ]);

    if (ea || eb) {
      setError(ea?.message ?? eb?.message ?? "Failed to reorder products");
    } else {
      setError("");
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!supabase) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    if (!confirm(`Delete product "${product.name}"? This will also delete its items.`)) return;
    const { error: delError } = await supabase.from("roadmap_products").delete().eq("id", productId);
    if (delError) {
      setError(delError.message);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setItems((prev) => prev.filter((it) => it.product_id !== productId));
    if (selectedProductId === productId) {
      setSelectedProductId(products.filter((p) => p.id !== productId)[0]?.id ?? "");
    }
    setError("");
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="grid gap-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Add item</div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          {!products.length ? (
            <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Create a product first.</div>
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

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Products</div>

          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex gap-3">
              <input
                className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="New product name"
              />
              <input
                className="h-10 w-12 rounded-xl border border-zinc-200 bg-white px-1 dark:border-zinc-800 dark:bg-zinc-900"
                type="color"
                value={newProductColor}
                onChange={(e) => setNewProductColor(e.target.value)}
              />
              <button
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                disabled={!newProductName.trim()}
                onClick={createProduct}
                type="button"
              >
                Add
              </button>
            </div>

            <div className="grid gap-2">
              {products.map((p, idx) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <input
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                    value={productNameDrafts[p.id] ?? p.name}
                    onChange={(e) =>
                      setProductNameDrafts((prev) => ({
                        ...prev,
                        [p.id]: e.target.value,
                      }))
                    }
                    onBlur={() => saveProductName(p.id)}
                  />
                  <input
                    className="h-9 w-10 rounded-lg border border-zinc-200 bg-white px-1 dark:border-zinc-800 dark:bg-zinc-950"
                    type="color"
                    value={p.color}
                    onChange={(e) => setProductColor(p.id, e.target.value)}
                  />
                  <button
                    className="h-9 w-9 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    disabled={idx === 0}
                    onClick={() => reorderProduct(p.id, "up")}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    className="h-9 w-9 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    disabled={idx === products.length - 1}
                    onClick={() => reorderProduct(p.id, "down")}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    className="col-span-4 mt-1 h-9 rounded-lg border border-zinc-200 text-sm text-red-600 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    onClick={() => deleteProduct(p.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
            <div className="sticky top-0 z-10 flex bg-white/90 backdrop-blur dark:bg-zinc-950/80">
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
              <div key={r.product.id} className="absolute left-0 right-0" style={{ top: r.y + 44 }}>
                <div
                  className="absolute left-0 top-0 flex items-center gap-3 pl-6"
                  style={{ width: leftPadding }}
                >
                  <div className="h-3 w-3 rounded-full" style={{ background: r.product.color }} />
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{r.product.name}</div>
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
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                fitView={false}
                panOnScroll
                onInit={setRf}
                onNodeClick={(_, n) => openItem(n.id)}
              >
                <Background gap={24} size={1} color="rgba(0,0,0,0.06)" />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Edit item</div>
                <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {(itemDraft.title as string | undefined) ?? selectedItem.title}
                </div>
              </div>
              <button
                className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  setSelectedItemId(null);
                  setItemDraft({});
                  setError("");
                }}
                type="button"
              >
                Close
              </button>
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

            <div className="mt-5 grid gap-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Title</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.title as string | undefined) ?? ""}
                    onChange={(e) => setItemDraft((p) => ({ ...p, title: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Product</div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.product_id as string | undefined) ?? selectedItem.product_id}
                    onChange={(e) => setItemDraft((p) => ({ ...p, product_id: e.target.value }))}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Status</div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.status as string | undefined) ?? selectedItem.status}
                    onChange={(e) => setItemDraft((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="planned">planned</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                    <option value="on_hold">on_hold</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Time mode</div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.time_mode as string | undefined) ?? selectedItem.time_mode}
                    onChange={(e) => setItemDraft((p) => ({ ...p, time_mode: e.target.value as TimeMode }))}
                  >
                    <option value="fixed">fixed</option>
                    <option value="range">range</option>
                    <option value="vague">vague</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Public</div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={String(Boolean(itemDraft.is_public ?? selectedItem.is_public))}
                    onChange={(e) => setItemDraft((p) => ({ ...p, is_public: e.target.value === "true" }))}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
              </div>

              {(itemDraft.time_mode ?? selectedItem.time_mode) !== "vague" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <div className="text-zinc-600 dark:text-zinc-400">Start date (YYYY-MM-DD)</div>
                    <input
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                      value={(itemDraft.start_date as string | null | undefined) ?? ""}
                      onChange={(e) => setItemDraft((p) => ({ ...p, start_date: e.target.value || null }))}
                      placeholder="2026-05-01"
                    />
                  </label>
                  <label className="grid gap-1">
                    <div className="text-zinc-600 dark:text-zinc-400">End date (YYYY-MM-DD)</div>
                    <input
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                      value={(itemDraft.end_date as string | null | undefined) ?? ""}
                      onChange={(e) => setItemDraft((p) => ({ ...p, end_date: e.target.value || null }))}
                      placeholder="2026-08-01"
                    />
                  </label>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Revenue low</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={String(itemDraft.revenue_low ?? "")}
                    onChange={(e) => setItemDraft((p) => ({ ...p, revenue_low: e.target.value ? Number(e.target.value) : null }))}
                    inputMode="numeric"
                  />
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Revenue high</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={String(itemDraft.revenue_high ?? "")}
                    onChange={(e) => setItemDraft((p) => ({ ...p, revenue_high: e.target.value ? Number(e.target.value) : null }))}
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Currency</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.revenue_currency as string | undefined) ?? "£"}
                    onChange={(e) => setItemDraft((p) => ({ ...p, revenue_currency: e.target.value }))}
                    placeholder="£"
                  />
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Confidence</div>
                  <select
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={(itemDraft.revenue_confidence as string | undefined) ?? "medium"}
                    onChange={(e) =>
                      setItemDraft((p) => ({ ...p, revenue_confidence: e.target.value as RevenueConfidence }))
                    }
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <div className="text-zinc-600 dark:text-zinc-400">Impact</div>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                    value={String(itemDraft.impact_score ?? "")}
                    onChange={(e) => setItemDraft((p) => ({ ...p, impact_score: e.target.value ? Number(e.target.value) : null }))}
                    inputMode="numeric"
                    placeholder="7"
                  />
                </label>
              </div>

              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Public summary (shown to investors)</div>
                <textarea
                  className="min-h-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={(itemDraft.public_summary as string | null | undefined) ?? ""}
                  onChange={(e) => setItemDraft((p) => ({ ...p, public_summary: e.target.value }))}
                  placeholder="1–2 sentences max."
                />
              </label>

              <label className="grid gap-1">
                <div className="text-zinc-600 dark:text-zinc-400">Internal notes</div>
                <textarea
                  className="min-h-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                  value={(itemDraft.internal_notes as string | null | undefined) ?? ""}
                  onChange={(e) => setItemDraft((p) => ({ ...p, internal_notes: e.target.value }))}
                  placeholder="Anything you don’t want in the investor view."
                />
              </label>

              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-between">
                <button
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  onClick={saveItem}
                  disabled={saving}
                  type="button"
                >
                  {saving ? "Saving…" : "Save"}
                </button>

                <button
                  className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-red-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  onClick={deleteItem}
                  disabled={saving}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
