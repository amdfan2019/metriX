import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLACEHOLDER_CATEGORIES = [
  { label: "Groceries", spent: 0, cap: 800 },
  { label: "Dining", spent: 0, cap: 400 },
  { label: "Transport", spent: 0, cap: 250 },
  { label: "Entertainment", spent: 0, cap: 200 },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const greeting = user?.email?.split("@")[0] ?? "there";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, {greeting}</h1>
          <p className="text-sm text-muted-foreground">
            Connect a bank to start seeing real numbers here.
          </p>
        </div>
        <Badge variant="secondary">Slice 1 · skeleton</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s briefing</CardTitle>
          <CardDescription>
            A daily summary written by Gemini will live here once your bank is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data yet. Once transactions flow in, this card surfaces a CFO-style read of the
            week — burn rate, anomalies, and what to watch.
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Budgets this month</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLACEHOLDER_CATEGORIES.map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardDescription>{c.label}</CardDescription>
                <CardTitle className="text-lg">
                  ${c.spent}{" "}
                  <span className="text-sm font-normal text-muted-foreground">/ ${c.cap}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-0 bg-foreground/80" aria-hidden />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
