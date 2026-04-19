import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import RoadmapEditor from "./RoadmapEditor";
import type { ItemRow, ProductRow } from "@/lib/roadmap/types";
import ShareSettings from "./ShareSettings";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function RoadmapPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <main className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Roadmap (internal)
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and in .env.local.
          </p>
        </main>
      </div>
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: roadmaps, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("slug", "outfund-viceversa")
    .limit(1);

  if (roadmapError) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {roadmapError.message}
        </div>
      </div>
    );
  }

  const roadmap = (roadmaps?.[0] as { id: string } | undefined) ?? null;
  if (!roadmap) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          No roadmap found. Create a row in the <span className="font-medium">roadmaps</span> table with slug{" "}
          <span className="font-medium">outfund-viceversa</span>.
        </div>
      </div>
    );
  }

  const [{ data: products, error: productsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("roadmap_products").select("*").eq("roadmap_id", roadmap.id).order("sort_order", { ascending: true }),
    supabase.from("roadmap_items").select("*").eq("roadmap_id", roadmap.id),
  ]);

  if (productsError || itemsError) {
    const message = productsError?.message ?? itemsError?.message ?? "Unknown error";
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
        <div className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {message}
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: shares, error: shareError } = await admin
    .from("roadmap_shares")
    .select("*")
    .eq("roadmap_id", roadmap.id)
    .limit(1);

  const share = !shareError ? ((shares?.[0] as { slug: string; password_hash: string | null } | undefined) ?? null) : null;
  const shareSlug = share?.slug ?? "outfund-viceversa";
  const hasPassword = Boolean(share?.password_hash);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Roadmap (internal)
          </h1>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{user.email}</div>
        </div>
        <SignOutButton />
      </div>

      <div className="mx-auto mt-8 w-full max-w-6xl">
        <RoadmapEditor
          roadmapId={roadmap.id}
          products={(products ?? []) as ProductRow[]}
          items={(items ?? []) as ItemRow[]}
        />
        <ShareSettings roadmapSlug="outfund-viceversa" shareSlug={shareSlug} hasPassword={hasPassword} />
      </div>
    </div>
  );
}
