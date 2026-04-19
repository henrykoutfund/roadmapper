import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password?.trim() ?? "";

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: shares, error: shareError } = await admin
    .from("roadmap_shares")
    .select("*")
    .eq("slug", slug)
    .limit(1);

  if (shareError) {
    return NextResponse.json({ error: shareError.message }, { status: 400 });
  }

  const share = (shares?.[0] as { id: string; password_hash: string | null } | undefined) ?? null;
  if (!share?.password_hash) {
    return NextResponse.json({ error: "Investor view not configured" }, { status: 404 });
  }

  const ok = await bcrypt.compare(password, share.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  const { error: insertError } = await admin.from("roadmap_share_sessions").insert({
    share_id: share.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: `rv_${slug}`,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: `/r/${slug}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

