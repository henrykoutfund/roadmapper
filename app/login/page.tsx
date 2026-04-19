"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Log in
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          We’ll email you a magic link.
        </p>

        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("sending");
            setMessage("");

            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: {
                emailRedirectTo: `${location.origin}/auth/callback`,
              },
            });

            if (error) {
              setStatus("error");
              setMessage(error.message);
              return;
            }

            setStatus("sent");
            setMessage("Magic link sent. Check your inbox.");
          }}
        >
          <label className="block text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Email
          </label>
          <input
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />

          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            disabled={status === "sending"}
            type="submit"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>

          {message ? (
            <div
              className={`text-sm ${
                status === "error" ? "text-red-600" : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {message}
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}