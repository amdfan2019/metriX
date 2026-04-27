"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFirstName, type SaveNameState } from "./actions";

interface NameFormProps {
  defaultName: string;
}

export function NameForm({ defaultName }: NameFormProps) {
  const [state, action, pending] = useActionState<SaveNameState, FormData>(
    saveFirstName,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if ("ok" in state) toast.success("Saved.");
    else if ("error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form
      key={defaultName}
      action={action}
      className="flex items-end gap-2 max-w-sm"
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor="firstName" className="text-xs">
          First name
        </Label>
        <Input
          id="firstName"
          name="firstName"
          type="text"
          autoComplete="given-name"
          placeholder="Max"
          defaultValue={defaultName}
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
