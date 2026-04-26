"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { confirmReview, correctReview } from "./actions";

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

interface ReviewRowProps {
  txnId: string;
  description: string;
  merchantName: string | null;
  category: Category | null;
  confidence: number | null;
  amountFmt: string;
  transactionDate: string;
  /** When false, hide Confirm + only render Correct (used for already-resolved rows). */
  showConfirm?: boolean;
}

export function ReviewRow({
  txnId,
  description,
  merchantName,
  category,
  confidence,
  amountFmt,
  transactionDate,
  showConfirm = true,
}: ReviewRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-medium">{merchantName ?? description}</p>
            {confidence != null && (
              <Badge variant="outline" className="text-[10px]">
                {Math.round(confidence * 100)}% conf
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground">
            {transactionDate} · {amountFmt} · suggested:{" "}
            <strong>{category ? CATEGORY_LABELS[category] : "other"}</strong>
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            {showConfirm && (
              <form action={confirmReview}>
                <input type="hidden" name="txnId" value={txnId} />
                <Button type="submit" size="sm" className="gap-1.5">
                  <Check className="size-3.5" aria-hidden />
                  Confirm
                </Button>
              </form>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden />
              {showConfirm ? "Correct" : "Edit"}
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <form
          action={correctReview}
          className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
        >
          <input type="hidden" name="txnId" value={txnId} />
          <div className="space-y-1">
            <Label htmlFor={`merchant-${txnId}`} className="text-xs">
              Merchant
            </Label>
            <Input
              id={`merchant-${txnId}`}
              name="merchantName"
              defaultValue={merchantName ?? ""}
              placeholder={description}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`category-${txnId}`} className="text-xs">
              Category
            </Label>
            <select
              id={`category-${txnId}`}
              name="category"
              defaultValue={category ?? "other"}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
