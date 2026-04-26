"use client";

import { EyeOff, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleIgnored, deleteSubscription } from "./actions";

interface RowActionsProps {
  id: string;
  source: "detected" | "manual";
  ignored: boolean;
}

export function RowActions({ id, source, ignored }: RowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <form action={toggleIgnored}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="ignored" value={String(!ignored)} />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1.5 text-xs"
          title={ignored ? "Stop ignoring" : "Ignore (treat as one-off)"}
        >
          {ignored ? (
            <>
              <Eye className="size-3.5" aria-hidden /> Unignore
            </>
          ) : (
            <>
              <EyeOff className="size-3.5" aria-hidden /> Ignore
            </>
          )}
        </Button>
      </form>
      {source === "manual" && (
        <form action={deleteSubscription}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            title="Delete this manual entry"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </form>
      )}
    </div>
  );
}
