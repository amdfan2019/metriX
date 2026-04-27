"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { SignOutButton } from "./sign-out-button";
import { Separator } from "@/components/ui/separator";

interface MobileNavProps {
  email: string;
}

/**
 * Mobile-only top bar with a toggle that drops down the same nav items the
 * desktop sidebar shows. Only rendered below md (sidebar is `hidden md:flex`),
 * so we don't double up on tablets and up. Closed by default — the user pulls
 * it down when they need to navigate.
 */
export function MobileNav({ email }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden border-b bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold tracking-tight">metriX</p>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="-mr-1 rounded p-1.5 hover:bg-sidebar-accent/40"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open && (
        <div onClick={() => setOpen(false)}>
          <Separator className="bg-sidebar-border" />
          <SidebarNav />
          <Separator className="bg-sidebar-border" />
          <div className="px-3 py-3">
            <p
              className="px-3 pb-2 text-xs text-sidebar-foreground/60 truncate"
              title={email}
            >
              {email}
            </p>
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
