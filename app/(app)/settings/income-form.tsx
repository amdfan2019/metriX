"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMonthlyIncome, type SaveIncomeState } from "./actions";

interface IncomeFormProps {
  /** Current value in dollars (already converted from cents), or null if unset. */
  defaultDollars: number | null;
}

export function IncomeForm({ defaultDollars }: IncomeFormProps) {
  const [state, action, pending] = useActionState<SaveIncomeState, FormData>(
    saveMonthlyIncome,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if ("ok" in state) toast.success("Monthly income saved.");
    else if ("error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex items-end gap-2 max-w-sm">
      <div className="flex-1 space-y-1">
        <Label htmlFor="incomeDollars" className="text-xs">
          Monthly income (AUD, after-tax)
        </Label>
        {/* `key` forces a fresh uncontrolled input whenever the saved value
            changes — Base UI warns if defaultValue mutates on a live input. */}
        <Input
          key={defaultDollars ?? "unset"}
          id="incomeDollars"
          name="incomeDollars"
          type="number"
          step="1"
          min="0"
          placeholder="6500"
          defaultValue={defaultDollars != null ? String(defaultDollars) : ""}
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
