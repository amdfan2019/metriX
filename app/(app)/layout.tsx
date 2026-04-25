import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { Separator } from "@/components/ui/separator";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="grid min-h-svh grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="px-5 py-5">
          <p className="text-base font-semibold tracking-tight">Ledger</p>
          <p className="text-xs text-sidebar-foreground/60">Personal finance, AI-first</p>
        </div>
        <Separator className="bg-sidebar-border" />
        <SidebarNav />
        <div className="mt-auto border-t border-sidebar-border px-3 py-3">
          <p className="px-3 pb-2 text-xs text-sidebar-foreground/60 truncate" title={user.email ?? ""}>
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
