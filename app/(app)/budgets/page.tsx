import Link from "next/link";
import { fetchUserBudgets } from "@/lib/budgets/queries";
import { listSpendingCategories } from "@/lib/budgets/calc";
import { fetchUserBudgetSettings } from "@/lib/budgets/income";
import { suggestBudgets } from "@/lib/budgets/suggest";
import { BudgetsForm } from "./budgets-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Sensible Sydney-ish starter caps in dollars, used only when the user
// hasn't set income yet (so the suggested-budget engine has nothing to anchor on).
const STARTER_DEFAULTS_DOLLARS: Record<string, number> = {
  groceries: 800,
  dining: 400,
  housing: 2500,
  utilities: 250,
  transport: 250,
  entertainment: 200,
  shopping: 300,
  health: 150,
  subscriptions: 80,
  other: 200,
};

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const fmt = (cents: number) => aud.format(cents / 100);

export default async function BudgetsPage() {
  const [existing, settings] = await Promise.all([
    fetchUserBudgets(),
    fetchUserBudgetSettings(),
  ]);
  const map = new Map(existing.map((b) => [b.category, b.monthlyCapCents]));

  const suggestions = suggestBudgets(
    settings.monthlyIncomeCents,
    settings.monthlySavingsTargetCents,
  );
  const suggestedByCategory = new Map(suggestions.rows.map((r) => [r.category, r.cents]));

  const initialValues = listSpendingCategories().map((c) => {
    const currentCents = map.get(c) ?? null;
    const suggestedCents = suggestedByCategory.get(c) ?? 0;
    return {
      category: c,
      currentDollars: currentCents != null ? Math.round(currentCents / 100) : 0,
      suggestedDollars: suggestedCents > 0 ? Math.round(suggestedCents / 100) : 0,
      starterDollars: STARTER_DEFAULTS_DOLLARS[c] ?? 0,
    };
  });

  const isFirstTime = existing.length === 0;
  const hasIncome = settings.monthlyIncomeCents != null && settings.monthlyIncomeCents > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Monthly cap per category, in AUD. The dashboard tracks your burn against these.
        </p>
      </header>

      {!hasIncome && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add your income for smarter suggestions</CardTitle>
            <CardDescription>
              Once we know your monthly income (and optional savings target) we&apos;ll suggest a
              budget split tuned to Sydney costs. You can still set caps manually below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings" className={buttonVariants({ size: "sm" })}>
              Add income on Settings
            </Link>
          </CardContent>
        </Card>
      )}

      {hasIncome && (
        <Card className="border-dashed bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Suggested split</CardTitle>
            <CardDescription className="text-xs">
              Based on {fmt(suggestions.income_cents)} income
              {suggestions.savings_target_cents > 0
                ? ` and ${fmt(suggestions.savings_target_cents)} savings target → ${fmt(suggestions.spending_envelope_cents)} for categories.`
                : ` (no savings target set — full income available for category caps).`}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isFirstTime ? "Set your starting budgets" : "Edit budgets"}</CardTitle>
          <CardDescription>
            {isFirstTime
              ? hasIncome
                ? "We've suggested a split from your income. Apply per row, apply all, or override with your own number."
                : "We've pre-filled with starter values for Sydney — adjust to your situation, or save as-is."
              : "Update any cap and hit save. Suggested values reflect your current income and savings target."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetsForm initialValues={initialValues} hasSuggestions={hasIncome} />
        </CardContent>
      </Card>
    </div>
  );
}
