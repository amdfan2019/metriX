"use client";

import { useActionState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rescanRecurring, type RescanState } from "./actions";

export function RescanButton() {
  const [state, action, pending] = useActionState<RescanState, FormData>(
    rescanRecurring,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if ("ok" in state) {
      const s = state.summary;
      const parts: string[] = [];
      if (s.inserted) parts.push(`${s.inserted} new`);
      if (s.updated) parts.push(`${s.updated} updated`);
      if (s.manualLinked) parts.push(`${s.manualLinked} linked to manual`);
      if (s.markedInactive) parts.push(`${s.markedInactive} marked inactive`);
      const detail = parts.length ? parts.join(" · ") : "no changes";
      toast.success(`Rescan done — ${detail}`);
    } else if ("error" in state) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={action}>
      <Button type="submit" disabled={pending} size="sm" variant="outline" className="gap-1.5">
        <RotateCcw className="size-3.5" aria-hidden />
        {pending ? "Rescanning…" : "Rescan"}
      </Button>
    </form>
  );
}
