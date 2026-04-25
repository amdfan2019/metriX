"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { correctReview } from "./actions";

const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining",
  rent: "Rent",
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

interface TransactionRowProps {
  id: string;
  description: string;
  merchantName: string | null;
  category: Category | null;
  amountCents: number;
  amountFmt: string;
  transactionDate: string;
  pending: boolean;
  isTransfer: boolean;
  needsReview: boolean;
}

export function TransactionRow(props: TransactionRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr>
        <td colSpan={5} className="bg-muted/40 px-4 py-3">
          <form
            action={correctReview}
            onSubmit={() => setEditing(false)}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[160px_1fr_1fr_auto_auto]"
          >
            <input type="hidden" name="txnId" value={props.id} />
            <p className="text-xs text-muted-foreground sm:col-span-1">
              <span className="block tabular-nums">{props.transactionDate}</span>
              <span className="block tabular-nums">{props.amountFmt}</span>
            </p>
            <div className="space-y-1">
              <Label htmlFor={`merchant-${props.id}`} className="text-xs">
                Merchant
              </Label>
              <Input
                id={`merchant-${props.id}`}
                name="merchantName"
                defaultValue={props.merchantName ?? ""}
                placeholder={props.description}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`category-${props.id}`} className="text-xs">
                Category
              </Label>
              <select
                id={`category-${props.id}`}
                name="category"
                defaultValue={props.category ?? "other"}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="gap-1.5"
            >
              <X className="size-3.5" aria-hidden />
              Cancel
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving will update this transaction and create an alias so future &ldquo;
            {props.description}&rdquo; transactions land in the same category.
          </p>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-2 text-muted-foreground tabular-nums">{props.transactionDate}</td>
      <td className="px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <p className="truncate">{props.merchantName ?? props.description}</p>
            {props.merchantName && props.merchantName !== props.description && (
              <p className="truncate text-xs text-muted-foreground">{props.description}</p>
            )}
          </div>
          {props.pending && (
            <Badge variant="outline" className="text-[10px]">
              pending
            </Badge>
          )}
          {props.isTransfer && (
            <Badge variant="secondary" className="text-[10px]">
              transfer
            </Badge>
          )}
          {props.needsReview && (
            <Badge variant="destructive" className="text-[10px]">
              review
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-2">
        {props.category ? (
          <span>{CATEGORY_LABELS[props.category]}</span>
        ) : (
          <span className="text-muted-foreground italic">uncategorised</span>
        )}
      </td>
      <td
        className={cn(
          "px-4 py-2 text-right tabular-nums",
          props.amountCents < 0 ? "" : "text-emerald-600 dark:text-emerald-500",
        )}
      >
        {props.amountFmt}
      </td>
      <td className="px-2 py-2 text-right">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label="Edit category"
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      </td>
    </tr>
  );
}
