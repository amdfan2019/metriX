"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  regenerateBriefingAction,
  seedTransactionsAction,
  wipeTransactionsAction,
  type DevActionResult,
} from "./dev-actions";

export function DevToolsBar() {
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<DevActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if ("ok" in result) toast.success(result.message);
      else toast.error(result.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-sm">
      <Badge variant="outline" className="text-xs uppercase tracking-wider">
        Dev
      </Badge>
      <span className="text-muted-foreground">Test data:</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(seedTransactionsAction)}
      >
        Seed 60d transactions
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(regenerateBriefingAction)}
      >
        Regen briefing
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        disabled={pending}
        onClick={() => run(wipeTransactionsAction)}
      >
        Wipe all
      </Button>
    </div>
  );
}
