import SharePasswordForm from "./SharePasswordForm";

export default function ShareSettings({
  roadmapSlug,
  shareSlug,
  hasPassword,
}: {
  roadmapSlug: string;
  shareSlug: string;
  hasPassword: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Investor link</div>

      <div className="mt-3 grid gap-3">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Shareable URL (password protected):</div>
        <div className="break-all rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
          /r/{shareSlug}
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          Password: {hasPassword ? "Set" : "Not set"}
        </div>

        <SharePasswordForm roadmapSlug={roadmapSlug} />
      </div>
    </div>
  );
}
