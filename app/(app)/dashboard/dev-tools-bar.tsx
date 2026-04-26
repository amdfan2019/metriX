import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  regenerateBriefingAction,
  seedTransactionsAction,
  wipeTransactionsAction,
} from "./dev-actions";

export function DevToolsBar() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-sm">
      <Badge variant="outline" className="text-xs uppercase tracking-wider">
        Dev
      </Badge>
      <span className="text-muted-foreground">Test data:</span>
      <form action={seedTransactionsAction}>
        <Button type="submit" size="sm" variant="outline">
          Seed 60d transactions
        </Button>
      </form>
      <form action={regenerateBriefingAction}>
        <Button type="submit" size="sm" variant="outline">
          Regen briefing
        </Button>
      </form>
      <form action={wipeTransactionsAction}>
        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
          Wipe all
        </Button>
      </form>
    </div>
  );
}
