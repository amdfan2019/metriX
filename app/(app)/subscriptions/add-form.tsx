"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CADENCE_VALUES, CATEGORY_VALUES, type Cadence, type Category } from "@/lib/db/schema";
import { addSubscription } from "./actions";

const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining",
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

const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function AddSubscriptionForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // We drive the action manually (instead of useActionState) so we can close
  // the form and reset it on success without tripping the
  // react-hooks/set-state-in-effect lint rule.
  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await addSubscription(undefined, formData);
      if (result && "ok" in result) {
        const msg =
          result.linked > 0
            ? `Subscription added — linked ${result.linked} past transaction${result.linked === 1 ? "" : "s"}.`
            : "Subscription added.";
        toast.success(msg);
        formRef.current?.reset();
        setOpen(false);
      } else if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus className="size-3.5" aria-hidden />
        Add subscription
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="merchantName" className="text-xs">
          Name
        </Label>
        <Input id="merchantName" name="merchantName" placeholder="Netflix" required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="add-category" className="text-xs">
          Category
        </Label>
        <select
          id="add-category"
          name="category"
          defaultValue="subscriptions"
          className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {CATEGORY_VALUES.filter((c) => c !== "transfer" && c !== "income").map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="add-cadence" className="text-xs">
          Cadence
        </Label>
        <select
          id="add-cadence"
          name="cadence"
          defaultValue="monthly"
          className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {CADENCE_VALUES.map((c) => (
            <option key={c} value={c}>
              {CADENCE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="amountDollars" className="text-xs">
          Amount (AUD)
        </Label>
        <Input
          id="amountDollars"
          name="amountDollars"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="23.99"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="nextExpectedDate" className="text-xs">
          Next expected date <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="nextExpectedDate" name="nextExpectedDate" type="date" />
      </div>

      <div className="flex items-end gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
