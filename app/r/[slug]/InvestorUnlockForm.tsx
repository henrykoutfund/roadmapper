"use client";

import { useState } from "react";

export default function InvestorUnlockForm({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  return (
    <form
      className="mt-6 grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("loading");
        setMessage("");

        const res = await fetch(`/r/${encodeURIComponent(slug)}/unlock`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });

        const json = (await res.json().catch(() => null)) as unknown;
        const error =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error?: unknown }).error === "string"
            ? ((json as { error: string }).error as string)
            : null;
        if (!res.ok) {
          setStatus("error");
          setMessage(error ?? "Invalid password");
          return;
        }

        location.reload();
      }}
    >
      <input
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        placeholder="Investor password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        autoComplete="current-password"
      />

      <button
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        disabled={status === "loading" || password.trim().length < 1}
        type="submit"
      >
        {status === "loading" ? "Unlocking…" : "Unlock"}
      </button>

      {status === "error" ? <div className="text-sm text-red-600">{message}</div> : null}
    </form>
  );
}
