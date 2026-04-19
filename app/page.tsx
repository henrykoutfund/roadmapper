import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const code = typeof sp?.code === "string" ? sp.code : undefined;
  const next = typeof sp?.next === "string" ? sp.next : undefined;

  if (code) {
    const qs = new URLSearchParams({ code });
    if (next) {
      qs.set("next", next);
    }
    redirect(`/auth/callback?${qs.toString()}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-6 flex items-center gap-4">
          <Image
            src="/branding/of_vv_logo.png"
            alt="Outfund ViceVersa"
            width={140}
            height={56}
            priority
          />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Outfund_ViceVersa Roadmap
        </h1>
        <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Edit internally with magic-link login, and share an investor view with a
          password.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            href="/roadmap"
          >
            Open roadmap
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
            href="/login"
          >
            Log in
          </Link>
        </div>

        <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Investor view: <span className="font-medium">/r/outfund-viceversa</span>
        </div>
      </main>
    </div>
  );
}
