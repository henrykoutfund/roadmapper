import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: roadmaps, error: roadmapError } = await admin
    .from("roadmaps")
    .select("*")
    .eq("slug", slug)
    .limit(1);

  if (roadmapError) {
    return NextResponse.json({ error: roadmapError.message }, { status: 400 });
  }

  const roadmap = (roadmaps?.[0] as { id: string; slug: string } | undefined) ?? null;
  if (!roadmap) {
    return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });
  }

  const { data: shares, error: shareError } = await admin
    .from("roadmap_shares")
    .select("*")
    .eq("roadmap_id", roadmap.id)
    .limit(1);

  if (shareError) {
    return NextResponse.json({ error: shareError.message }, { status: 400 });
  }

  const share = (shares?.[0] as { slug: string; password_hash: string | null } | undefined) ?? null;

  return NextResponse.json({
    shareSlug: share?.slug ?? roadmap.slug,
    hasPassword: Boolean(share?.password_hash),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password?.trim() ?? "";
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: roadmaps, error: roadmapError } = await admin
    .from("roadmaps")
    .select("*")
    .eq("slug", slug)
    .limit(1);

  if (roadmapError) {
    return NextResponse.json({ error: roadmapError.message }, { status: 400 });
  }

  const roadmap = (roadmaps?.[0] as { id: string; slug: string } | undefined) ?? null;
  if (!roadmap) {
    return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error: upsertError } = await admin.from("roadmap_shares").upsert({
    roadmap_id: roadmap.id,
    slug: roadmap.slug,
    password_hash: passwordHash,
  });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, shareSlug: roadmap.slug });
}

