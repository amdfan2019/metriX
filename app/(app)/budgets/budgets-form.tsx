"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  subscriptions: "Subscriptions",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
};

interface BudgetsFormProps {
  initialValues: InitialValue[];
  /** When false, hide the suggestion-column UI (income is unset). */
  hasSuggestions: boolean;
}

export function BudgetsForm({ initialValues, hasSuggestions }: BudgetsFormProps) {
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
    toast.success("Applied suggested values to every category.");
  };

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

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save budgets"}
        </Button>
      </div>
    </form>
  );
}
