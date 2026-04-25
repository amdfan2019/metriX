import { signOut } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" aria-hidden />
        <span>Sign out</span>
      </Button>
    </form>
  );
}
