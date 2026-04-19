"use client";

import { useState } from "react";

export default function SharePasswordForm({ roadmapSlug }: { roadmapSlug: string }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <input
        className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        placeholder="Set / rotate investor password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        autoComplete="new-password"
      />
      <button
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        disabled={saving || password.trim().length < 6}
        onClick={async () => {
          setSaving(true);
          setError("");
          const res = await fetch(`/api/roadmaps/${encodeURIComponent(roadmapSlug)}/share`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password }),
          });
          const json = (await res.json().catch(() => null)) as unknown;
          const errorMessage =
            json &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error?: unknown }).error === "string"
              ? ((json as { error: string }).error as string)
              : null;
          if (!res.ok) {
            setSaving(false);
            setError(errorMessage ?? "Failed to save password");
            return;
          }
          setPassword("");
          setSaving(false);
          location.reload();
        }}
        type="button"
      >
        {saving ? "Saving…" : "Save password"}
      </button>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
