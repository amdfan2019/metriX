"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getServerSnapshot = () => false;
const getClientSnapshot = () => true;

/**
 * Three-state segmented toggle: system / light / dark. We render a placeholder
 * during SSR (and the first client render) so the toggle doesn't flash the
 * wrong "active" pill before next-themes hydrates. useSyncExternalStore is
 * the lint-clean way to detect "client-mounted" without setState-in-effect.
 */
export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const { theme, setTheme } = useTheme();

  if (!mounted) {
    return <div className="h-7 w-[84px]" aria-hidden />;
  }

  const buttons: Array<{
    value: "light" | "dark" | "system";
    label: string;
    icon: typeof Sun;
  }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-sidebar-border bg-sidebar p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {buttons.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "rounded-sm p-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground",
              active && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
