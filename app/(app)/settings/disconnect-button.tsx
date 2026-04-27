"use client";

import { useTransition } from "react";
import { Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectBank } from "./actions";

export function DisconnectButton({ connectionId }: { connectionId: string }) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        "Disconnect this bank? Future transactions stop syncing. Existing transactions stay until you wipe them.",
      )
    )
      return;
    startTransition(async () => {
      const result = await disconnectBank(connectionId);
      if ("ok" in result) toast.success(result.message);
      else toast.error(result.error);
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={onClick}
    >
      <Unplug className="size-3.5" aria-hidden />
      {pending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
