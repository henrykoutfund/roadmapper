import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/roadmap";

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL(`/login?error=missing_env`, url.origin));
  }

  let error: { message?: string } | null = null;
  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash && otpType) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as EmailOtpType,
    });
    error = result.error;
  } else {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, url.origin));
  }

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=auth_failed`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
