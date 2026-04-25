import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { basiq } from "@/lib/basiq/client";
import { syncTransactionsForUser } from "@/lib/basiq/sync";

/**
 * Basiq redirects the user back here after the consent flow. We use the user's
 * existing session cookie to know who they are; Basiq's URL params we mostly
 * ignore beyond surfacing them in the error case.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", "/settings");
    return NextResponse.redirect(url);
  }

  const basiqUserId = user.user_metadata?.basiq_user_id as string | undefined;
  if (!basiqUserId) {
    return NextResponse.redirect(
      new URL("/settings?error=no-basiq-user", request.url),
    );
  }

  try {
    const connections = await basiq.listConnections(basiqUserId);

    for (const conn of connections) {
      let institutionName: string | null = null;
      if (conn.institution?.id) {
        try {
          const inst = await basiq.getInstitution(conn.institution.id);
          institutionName = inst.name ?? null;
        } catch {
          // Non-fatal — we'll still record the connection without the name.
        }
      }

      const { error } = await supabase.from("bank_connections").upsert(
        {
          user_id: user.id,
          basiq_user_id: basiqUserId,
          basiq_connection_id: conn.id,
          institution_name: institutionName,
          status: conn.status ?? "active",
        },
        { onConflict: "user_id,basiq_connection_id" },
      );
      if (error) throw new Error(`Failed to upsert connection: ${error.message}`);
    }

    await syncTransactionsForUser(supabase, user.id, basiqUserId);

    return NextResponse.redirect(new URL("/settings?connected=true", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("Basiq callback failed:", message);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
