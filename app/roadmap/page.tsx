import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

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

      <div className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          Next up: Tube-map canvas + CRUD backed by Supabase.
        </div>
      </div>
    </div>
  );
}
