"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSpendingCategories } from "@/lib/budgets/calc";
import { suggestBudgets, DEFAULT_SAVINGS_RATIO } from "@/lib/budgets/suggest";
import type { Category } from "@/lib/db/schema";
import { completeOnboarding, type OnboardingState } from "./actions";

const LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining out",
  housing: "Housing",
  utilities: "Utilities",
  transport: "Transport",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
};

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function OnboardingWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [incomeDollars, setIncomeDollars] = useState<number>(0);
  const [savingsDollars, setSavingsDollars] = useState<number>(0);
  const [budgetOverrides, setBudgetOverrides] = useState<Record<Category, number>>(
    {} as Record<Category, number>,
  );

  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    undefined,
  );

  useEffect(() => {
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  const suggestion = useMemo(
    () => suggestBudgets(Math.round(incomeDollars * 100), Math.round(savingsDollars * 100)),
    [incomeDollars, savingsDollars],
  );
  const suggestedDollarsByCategory = useMemo(
    () => Object.fromEntries(suggestion.rows.map((r) => [r.category, Math.round(r.cents / 100)])),
    [suggestion],
  );

  const goToStep2 = () => {
    if (incomeDollars <= 0) {
      toast.error("Enter your monthly income to continue.");
      return;
    }
    // Default savings to 15% of income on first arrival.
    if (savingsDollars === 0) {
      setSavingsDollars(Math.round(incomeDollars * DEFAULT_SAVINGS_RATIO));
    }
    setStep(2);
  };

  const goToStep3 = () => {
    if (savingsDollars > incomeDollars) {
      toast.error("Savings target can't exceed income.");
      return;
    }
    setStep(3);
  };

  const valueFor = (category: Category): number =>
    budgetOverrides[category] ?? suggestedDollarsByCategory[category] ?? 0;

  return (
    <form action={action} className="space-y-4">
      {/* Hidden inputs — the action reads everything from formData. */}
      <input type="hidden" name="incomeDollars" value={incomeDollars} />
      <input type="hidden" name="savingsDollars" value={savingsDollars} />
      {listSpendingCategories().map((c) => (
        <input
          key={c}
          type="hidden"
          name={c}
          value={valueFor(c)}
        />
      ))}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 · Your monthly income</CardTitle>
            <CardDescription>
              After-tax take-home that lands in your account each month, in AUD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-1">
              <Label htmlFor="income-step" className="text-xs">
                Monthly income (AUD)
              </Label>
              <Input
                id="income-step"
                type="number"
                step="50"
                min="0"
                placeholder="6500"
                value={incomeDollars || ""}
                onChange={(e) => setIncomeDollars(e.target.value === "" ? 0 : Number(e.target.value))}
                autoFocus
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={goToStep2} className="gap-1.5">
                Next <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 · Savings target</CardTitle>
            <CardDescription>
              How much you want to set aside every month. Defaults to 15% of income — adjust freely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-1">
              <Label htmlFor="savings-step" className="text-xs">
                Savings target (AUD)
              </Label>
              <Input
                id="savings-step"
                type="number"
                step="50"
                min="0"
                value={savingsDollars || ""}
                onChange={(e) => setSavingsDollars(e.target.value === "" ? 0 : Number(e.target.value))}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {savingsDollars > 0 && incomeDollars > 0
                  ? `${Math.round((savingsDollars / incomeDollars) * 100)}% of income · ${aud.format(incomeDollars - savingsDollars)} for monthly spend`
                  : "Set 0 if you don't want to set a target right now."}
              </p>
            </div>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={goToStep3} className="gap-1.5">
                Next <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 · Review your budgets</CardTitle>
            <CardDescription>
              Suggested split based on your numbers. Edit anything that doesn&apos;t match your reality.
              You can change these any time on the Budgets page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              From {aud.format(incomeDollars)} income
              {savingsDollars > 0
                ? `, ${aud.format(savingsDollars)} reserved for savings`
                : `, no savings target`}
              {" "}→ {aud.format(suggestion.spending_envelope_cents / 100)} envelope across categories.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {listSpendingCategories().map((c) => (
                <div key={c} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={`onb-${c}`}>{LABELS[c]}</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      Suggest ${suggestedDollarsByCategory[c] ?? 0}
                    </span>
                  </div>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                      aria-hidden
                    >
                      $
                    </span>
                    <Input
                      id={`onb-${c}`}
                      type="number"
                      min="0"
                      step="1"
                      className="pl-7"
                      value={valueFor(c) || ""}
                      onChange={(e) =>
                        setBudgetOverrides((curr) => ({
                          ...curr,
                          [c]: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Looks good — save & continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ol className="flex items-center gap-2 text-xs text-muted-foreground">
        <li className={step === 1 ? "font-medium text-foreground" : ""}>1. Income</li>
        <span aria-hidden>·</span>
        <li className={step === 2 ? "font-medium text-foreground" : ""}>2. Savings</li>
        <span aria-hidden>·</span>
        <li className={step === 3 ? "font-medium text-foreground" : ""}>3. Budgets</li>
      </ol>
    </form>
  );
}
