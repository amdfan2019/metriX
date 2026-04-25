import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BudgetsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Set a monthly cap per category. The dashboard tracks burn rate against these.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Slice 2</CardTitle>
          <CardDescription>
            Budget setup UI. After Basiq is connected, defaults will pre-fill from your last 90
            days of spend (median × 1.1).
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
