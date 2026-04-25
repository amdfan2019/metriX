"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMobile, type SaveMobileState } from "./actions";

interface MobileFormProps {
  defaultValue: string | null;
}

export function MobileForm({ defaultValue }: MobileFormProps) {
  const [state, action, pending] = useActionState<SaveMobileState, FormData>(
    saveMobile,
    undefined,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Mobile saved.");
    else if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="mobile">Mobile (AU)</Label>
        <Input
          // Remount on saved-value change so the uncontrolled input picks up
          // the latest defaultValue instead of warning about a mid-life change.
          key={defaultValue ?? "empty"}
          id="mobile"
          name="mobile"
          type="tel"
          placeholder="0412 345 678"
          defaultValue={defaultValue ?? ""}
          required
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save mobile"}
      </Button>
    </form>
  );
}
