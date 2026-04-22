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

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;
  const verificationType = data?.properties?.verification_type;
  if (error || !tokenHash || !verificationType) {
    return NextResponse.json({ error: error?.message ?? "generate_link_failed" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const callbackUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL ?? origin);
  callbackUrl.searchParams.set("token_hash", tokenHash);
  callbackUrl.searchParams.set("type", verificationType);
  callbackUrl.searchParams.set("next", "/roadmap");

  return NextResponse.json({ action_link: callbackUrl.toString() });
}
