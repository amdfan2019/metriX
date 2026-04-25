"use client";

import { useActionState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runCategorisation, type RunCategorisationState } from "./actions";

export function RunCategorisationButton({ pendingCount }: { pendingCount: number }) {
  const [state, action, pending] = useActionState<RunCategorisationState, FormData>(
    runCategorisation,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if ("ok" in state) {
      const s = state.summary;
      const parts: string[] = [];
      if (s.resolvedByAlias) parts.push(`${s.resolvedByAlias} via alias`);
      if (s.resolvedByFuzzy) parts.push(`${s.resolvedByFuzzy} via fuzzy`);
      if (s.resolvedByGemini) parts.push(`${s.resolvedByGemini} via Gemini`);
      if (s.flaggedForReview) parts.push(`${s.flaggedForReview} need review`);
      const detail = parts.length ? parts.join(" · ") : "nothing to do";
      toast.success(`Categorisation done — ${detail}`);
    } else if ("error" in state) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={action}>
      <Button
        type="submit"
        disabled={pending || pendingCount === 0}
        size="sm"
        className="gap-1.5"
      >
        <Sparkles className="size-3.5" aria-hidden />
        {pending ? "Categorising…" : `Run categorisation${pendingCount ? ` (${pendingCount})` : ""}`}
      </Button>
    </form>
  );
}
