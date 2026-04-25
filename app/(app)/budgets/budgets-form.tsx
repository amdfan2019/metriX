"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBudgets, type SaveBudgetsState } from "./actions";
import type { Category } from "@/lib/db/schema";

interface InitialValue {
  category: Category;
  dollars: number;
}

const LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining out",
  rent: "Rent / mortgage",
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

export function BudgetsForm({ initialValues }: { initialValues: InitialValue[] }) {
  const [state, formAction, pending] = useActionState<SaveBudgetsState, FormData>(
    saveBudgets,
    undefined,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Budgets saved.");
    else if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {initialValues.map(({ category, dollars }) => (
          <div key={category} className="space-y-1.5">
            <Label htmlFor={category}>{LABELS[category]}</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                aria-hidden
              >
                $
              </span>
              <Input
                id={category}
                name={category}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={dollars || ""}
                placeholder="0"
                className="pl-7"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save budgets"}
        </Button>
      </div>
    </form>
  );
}
