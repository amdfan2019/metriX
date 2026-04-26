"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveBudgets, type SaveBudgetsState } from "./actions";
import type { Category } from "@/lib/db/schema";

interface InitialValue {
  category: Category;
  /** Cap currently saved in DB (or 0 if unset). */
  currentDollars: number;
  /** Income-derived suggestion (or 0 if income unset). */
  suggestedDollars: number;
  /** Sydney-ish fallback when income unset. */
  starterDollars: number;
}

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
const fmtDollars = (dollars: number) => aud.format(dollars);

interface BudgetsFormProps {
  initialValues: InitialValue[];
  /** When false, hide the suggestion-column UI (income is unset). */
  hasSuggestions: boolean;
  /** User's monthly income in dollars, or null if unset. Drives the live
   *  total-vs-income indicator and the over-income save block. */
  incomeDollars: number | null;
  /** Current savings target in dollars (now edited inline on this page). */
  savingsTargetDollars: number | null;
  /** Suggested savings target derived from default ratio. */
  suggestedSavingsDollars: number;
}

export function BudgetsForm({
  initialValues,
  hasSuggestions,
  incomeDollars,
  savingsTargetDollars,
  suggestedSavingsDollars,
}: BudgetsFormProps) {
  const [state, formAction, pending] = useActionState<SaveBudgetsState, FormData>(
    saveBudgets,
    undefined,
  );

  // Initial input value — current cap, or starter if no current and no
  // suggestion mode (so first-time users see populated fields).
  const initialDollarsByCategory = Object.fromEntries(
    initialValues.map((v) => [
      v.category,
      v.currentDollars > 0 ? v.currentDollars : hasSuggestions ? 0 : v.starterDollars,
    ]),
  ) as Record<Category, number>;

  const [values, setValues] = useState<Record<Category, number>>(initialDollarsByCategory);
  const [savings, setSavings] = useState<number>(savingsTargetDollars ?? 0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) toast.success("Budgets saved.");
    else if (state && "error" in state) toast.error(state.error);
  }, [state]);

  const applySuggestion = (category: Category, dollars: number) => {
    setValues((v) => ({ ...v, [category]: dollars }));
  };

  const applyAll = () => {
    const next: Record<Category, number> = { ...values };
    for (const v of initialValues) {
      if (v.suggestedDollars > 0) next[v.category] = v.suggestedDollars;
    }
    setValues(next);
    if (suggestedSavingsDollars > 0) setSavings(suggestedSavingsDollars);
    toast.success("Applied suggested values everywhere.");
  };

  // Live total-vs-income guard. Now savings is part of the budget — savings
  // and category caps must add up to (or under) income.
  //   over    — savings + caps > income; save is blocked
  //   under   — savings + caps < income; allowed (residue is "unallocated buffer")
  //   exact   — savings + caps == income (perfect allocation)
  const categoryTotalDollars = useMemo(
    () => Object.values(values).reduce((sum, v) => sum + (v || 0), 0),
    [values],
  );
  const totalDollars = categoryTotalDollars + (savings || 0);
  const overIncome = incomeDollars != null && totalDollars > incomeDollars;
  const exact = incomeDollars != null && totalDollars === incomeDollars;
  const unallocatedDollars =
    incomeDollars != null ? Math.max(0, incomeDollars - totalDollars) : 0;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {hasSuggestions && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={applyAll}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Apply all suggestions
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Savings sits in the same grid as the category caps so the layout is
            visually symmetrical. It's still distinguished — a small "goal"
            label since it's an outflow target, not a spending cap. */}
        {incomeDollars != null && incomeDollars > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="savingsTarget">
                Savings <span className="text-[10px] uppercase tracking-wide text-muted-foreground">goal</span>
              </Label>
              {suggestedSavingsDollars > 0 && savings !== suggestedSavingsDollars && (
                <button
                  type="button"
                  onClick={() => setSavings(suggestedSavingsDollars)}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  title={`Apply suggested $${suggestedSavingsDollars}`}
                >
                  Suggest ${suggestedSavingsDollars}
                </button>
              )}
            </div>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                aria-hidden
              >
                $
              </span>
              <Input
                id="savingsTarget"
                name="savingsTarget"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={savings || ""}
                onChange={(e) =>
                  setSavings(e.target.value === "" ? 0 : Number(e.target.value))
                }
                placeholder="0"
                className="pl-7"
              />
            </div>
          </div>
        )}

        {initialValues.map((v) => {
          const value = values[v.category];
          const matchesSuggestion = hasSuggestions && v.suggestedDollars > 0 && value === v.suggestedDollars;
          return (
            <div key={v.category} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={v.category}>{LABELS[v.category]}</Label>
                {hasSuggestions && v.suggestedDollars > 0 && !matchesSuggestion && (
                  <button
                    type="button"
                    onClick={() => applySuggestion(v.category, v.suggestedDollars)}
                    className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    title={`Apply suggested $${v.suggestedDollars}`}
                  >
                    Suggest ${v.suggestedDollars}
                  </button>
                )}
              </div>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden
                >
                  $
                </span>
                <Input
                  id={v.category}
                  name={v.category}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={value || ""}
                  onChange={(e) =>
                    setValues((curr) => ({
                      ...curr,
                      [v.category]: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>
          );
        })}
      </div>

      {incomeDollars != null && incomeDollars > 0 && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            overIncome
              ? "border-destructive/40 bg-destructive/5"
              : exact
                ? "border-green-500/40 bg-green-500/5"
                : "border-yellow-500/30 bg-yellow-500/5",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              Allocated: {fmtDollars(totalDollars)} (savings {fmtDollars(savings)} + categories{" "}
              {fmtDollars(categoryTotalDollars)}) of {fmtDollars(incomeDollars)} income
            </span>
            <span
              className={cn(
                "tabular-nums text-xs",
                overIncome
                  ? "text-destructive"
                  : exact
                    ? "text-green-700 dark:text-green-500"
                    : "text-yellow-700 dark:text-yellow-500",
              )}
            >
              {overIncome
                ? `${fmtDollars(totalDollars - incomeDollars)} over income`
                : exact
                  ? "Balanced"
                  : `${fmtDollars(unallocatedDollars)} unallocated`}
            </span>
          </div>
          {overIncome && (
            <p className="mt-1 text-xs text-destructive">
              Savings + category caps can&apos;t exceed your income. Trim somewhere before saving.
            </p>
          )}
          {!overIncome && !exact && unallocatedDollars > 0 && (
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-500">
              {fmtDollars(unallocatedDollars)} of your income isn&apos;t allocated to savings or any
              category — it accumulates as a buffer. Bump savings or a category to balance.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || overIncome}>
          {pending ? "Saving…" : "Save budgets"}
        </Button>
      </div>
    </form>
  );
}
