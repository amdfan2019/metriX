import { fetchUserBudgets } from "@/lib/budgets/queries";
import { listSpendingCategories } from "@/lib/budgets/calc";
import { BudgetsForm } from "./budgets-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Sensible Sydney-ish starter caps in dollars. Used as the initial form values
// until Slice 3 brings real Basiq history in to compute median × 1.1.
const STARTER_DEFAULTS_DOLLARS: Record<string, number> = {
  groceries: 800,
  dining: 400,
  rent: 2500,
  utilities: 250,
  transport: 250,
  entertainment: 200,
  shopping: 300,
  health: 150,
  subscriptions: 80,
  other: 200,
};

export default async function BudgetsPage() {
  const existing = await fetchUserBudgets();
  const map = new Map(existing.map((b) => [b.category, b.monthlyCapCents]));

  const initialValues = listSpendingCategories().map((c) => ({
    category: c,
    dollars: map.has(c)
      ? Math.round((map.get(c)! / 100) * 100) / 100
      : STARTER_DEFAULTS_DOLLARS[c] ?? 0,
  }));

  const isFirstTime = existing.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Monthly cap per category, in AUD. The dashboard tracks your burn against these.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{isFirstTime ? "Set your starting budgets" : "Edit budgets"}</CardTitle>
          <CardDescription>
            {isFirstTime
              ? "We've pre-filled with starter values for Sydney — adjust to your situation, or save as-is."
              : "Update any cap and hit save."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetsForm initialValues={initialValues} />
        </CardContent>
      </Card>
    </div>
  );
}
