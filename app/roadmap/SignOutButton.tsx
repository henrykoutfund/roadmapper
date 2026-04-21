"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
      disabled={busy || !supabase}
      onClick={async () => {
        if (!supabase) return;
        setBusy(true);
        await supabase.auth.signOut();
        router.refresh();
        router.push("/");
      }}
      type="button"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
