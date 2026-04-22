import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  email: z.string().email(),
});

const allowedDomains = ["@goviceversa.com", "@out.fund"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!allowedDomains.some((d) => email.endsWith(d))) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? origin}/auth/callback`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? "generate_link_failed" }, { status: 500 });
  }

  return NextResponse.json({ action_link: data.properties.action_link });
}
