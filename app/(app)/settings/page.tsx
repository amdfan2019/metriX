import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchUserConnections } from "@/lib/basiq/queries";
import { startBankConnection, manualSync, pullFromBasiq } from "./actions";
import { MobileForm } from "./mobile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SearchParams = Promise<{ connected?: string; error?: string }>;

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connections = await fetchUserConnections();
  const userMobile = (user?.user_metadata?.mobile as string | undefined) ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account and bank connections.</p>
      </header>

      {params.connected === "true" && (
        <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 text-green-600 dark:text-green-500" aria-hidden />
          <div>
            <p className="font-medium">Bank connected.</p>
            <p className="text-muted-foreground">
              We&apos;ve pulled your transactions — head to the dashboard.
            </p>
          </div>
        </div>
      )}

      {params.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">Connection failed.</p>
            <p className="text-muted-foreground break-all">{params.error}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Mobile</p>
            <p className="text-xs text-muted-foreground">
              Required by Basiq for SMS consent verification. AU format only.
            </p>
          </div>
          <MobileForm defaultValue={userMobile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Bank connections</CardTitle>
              <CardDescription>
                Connect via Basiq (sandbox in dev). We pull the last 90 days on first connect, then
                sync daily.
              </CardDescription>
            </div>
            {connections.length > 0 && (
              <form action={manualSync}>
                <Button type="submit" variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw className="size-3.5" aria-hidden />
                  Sync now
                </Button>
              </form>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No banks connected yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{c.institutionName ?? "Bank"}</p>
                    <p className="text-xs text-muted-foreground">
                      Last synced {formatRelative(c.lastSyncedAt)}
                    </p>
                  </div>
                  <Badge variant={c.status === "active" ? "secondary" : "outline"} className="text-xs">
                    {c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <form action={startBankConnection}>
              <Button type="submit">
                {connections.length === 0 ? "Connect a bank" : "Connect another bank"}
              </Button>
            </form>
            <form action={pullFromBasiq}>
              <Button type="submit" variant="outline">
                Pull from Basiq
              </Button>
            </form>
          </div>
          <p className="text-xs text-muted-foreground">
            If Basiq doesn&apos;t auto-redirect back after consent, click <strong>Pull from
            Basiq</strong> to reconcile.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
