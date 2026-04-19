import Link from "next/link";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import InvestorUnlockForm from "./InvestorUnlockForm";
import RoadmapViewer from "./RoadmapViewer";
import type { ItemRow, ProductRow } from "@/lib/roadmap/types";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export default async function InvestorRoadmapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(`rv_${slug}`)?.value ?? "";

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  if (!admin) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Missing server environment variables.
          </div>
        </main>
      </div>
    );
  }

  const { data: shares, error: shareError } = await admin
    .from("roadmap_shares")
    .select("*")
    .eq("slug", slug)
    .limit(1);

  if (shareError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-red-600">{shareError.message}</div>
        </main>
      </div>
    );
  }

  const share =
    (shares?.[0] as { id: string; roadmap_id: string; password_hash: string | null } | undefined) ?? null;

  if (!share) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Investor view</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Not found
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This investor link hasn’t been configured.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
              href="/"
            >
              Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!share.password_hash) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Investor view</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Locked
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            This link exists but no password has been set yet.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
              href="/"
            >
              Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const tokenHash = token ? sha256Hex(token) : "";
  const { data: sessions } = tokenHash
    ? await admin
        .from("roadmap_share_sessions")
        .select("*")
        .eq("share_id", share.id)
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
    : { data: [] as Array<Record<string, unknown>> };

  const isUnlocked = Boolean(sessions?.length);

  if (!isUnlocked) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Investor view</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Enter password
          </h1>
          <InvestorUnlockForm slug={slug} />
          <div className="mt-8">
            <Link
              className="text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
              href="/"
            >
              Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const [{ data: products, error: productsError }, { data: items, error: itemsError }] = await Promise.all([
    admin
      .from("roadmap_products")
      .select("*")
      .eq("roadmap_id", share.roadmap_id)
      .order("sort_order", { ascending: true }),
    admin
      .from("roadmap_items")
      .select("*")
      .eq("roadmap_id", share.roadmap_id)
      .eq("is_public", true),
  ]);

  if (productsError || itemsError) {
    const message = productsError?.message ?? itemsError?.message ?? "Failed to load roadmap";
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-red-600">{message}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div>
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Investor view</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Outfund_ViceVersa Roadmap
          </h1>
        </div>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
          href="/"
        >
          Home
        </Link>
      </div>

      <div className="mx-auto mt-8 w-full max-w-6xl">
        <RoadmapViewer products={(products ?? []) as ProductRow[]} items={(items ?? []) as ItemRow[]} />
      </div>
    </div>
  );
}
