import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true });

    // Buscar role do perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const body = await request.json();
    const events: Array<{
      event_type: string;
      resource_type?: string;
      resource_id?: string;
      metadata?: Record<string, unknown>;
    }> = Array.isArray(body) ? body : [body];

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const rows = events.map((e) => ({
      user_id: user.id,
      role: profile?.role ?? "comum",
      event_type: e.event_type,
      resource_type: e.resource_type ?? null,
      resource_id: e.resource_id ?? null,
      metadata: e.metadata ?? {},
      ip_address: ipAddress,
    }));

    // Fire-and-forget: não esperamos o resultado
    supabase.from("analytics_events").insert(rows);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
