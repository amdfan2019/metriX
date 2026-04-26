"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBudgetSettings, type SaveBudgetSettingsState } from "./actions";

interface IncomeFormProps {
  /** Current values in dollars (already converted from cents), or null if unset. */
  defaultIncomeDollars: number | null;
  defaultSavingsDollars: number | null;
}

export function IncomeForm({ defaultIncomeDollars, defaultSavingsDollars }: IncomeFormProps) {
  const [state, action, pending] = useActionState<SaveBudgetSettingsState, FormData>(
    saveBudgetSettings,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if ("ok" in state) toast.success("Saved.");
    else if ("error" in state) toast.error(state.error);
  }, [state]);

  // `key` forces a fresh uncontrolled form whenever the saved value changes —
  // Base UI warns if defaultValue mutates on a live input.
  const formKey = `${defaultIncomeDollars ?? "u"}-${defaultSavingsDollars ?? "u"}`;

  return (
    <form
      key={formKey}
      action={action}
      className="grid grid-cols-1 gap-3 max-w-md sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="space-y-1">
        <Label htmlFor="incomeDollars" className="text-xs">
          Monthly income (AUD)
        </Label>
        <Input
          id="incomeDollars"
          name="incomeDollars"
          type="number"
          step="1"
          min="0"
          placeholder="6500"
          defaultValue={defaultIncomeDollars != null ? String(defaultIncomeDollars) : ""}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="savingsDollars" className="text-xs">
          Savings target (AUD)
        </Label>
        <Input
          id="savingsDollars"
          name="savingsDollars"
          type="number"
          step="1"
          min="0"
          placeholder="1000"
          defaultValue={defaultSavingsDollars != null ? String(defaultSavingsDollars) : ""}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
