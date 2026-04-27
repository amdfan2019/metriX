"use client";

import { useTransition } from "react";
import { Bell, CircleAlert, OctagonAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertSeverity } from "@/lib/db/schema";
import type { AlertRow } from "@/lib/alerts/queries";
import { dismissAlert } from "./alert-actions";

const SEVERITY_TONE: Record<AlertSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/5",
  warn: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-foreground/15 bg-muted/40",
};

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  warn: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 border-yellow-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  warn: "Warn",
  info: "FYI",
};

const SEVERITY_ICON: Record<AlertSeverity, typeof Bell> = {
  critical: OctagonAlert,
  warn: CircleAlert,
  info: Bell,
};

export function AlertsCard({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4" aria-hidden />
          Alerts ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {alerts.map((a) => (
            <AlertRowItem key={a.id} alert={a} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AlertRowItem({ alert }: { alert: AlertRow }) {
  const [pending, startTransition] = useTransition();
  const Icon = SEVERITY_ICON[alert.severity];

  const onDismiss = () => {
    startTransition(async () => {
      const result = await dismissAlert(alert.id);
      if (result && "error" in result) toast.error(result.error);
    });
  };

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", SEVERITY_TONE[alert.severity])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-medium">{alert.title}</p>
          <Badge variant="outline" className={cn("text-[10px]", SEVERITY_BADGE[alert.severity])}>
            {SEVERITY_LABEL[alert.severity]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{alert.body}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-muted-foreground"
        disabled={pending}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}
