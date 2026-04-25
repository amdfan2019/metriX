import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Promise<{ redirect?: string; signup?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const redirectTo = params.redirect ?? "/dashboard";

  const banner =
    params.signup === "check-email"
      ? "Check your email to confirm your account, then sign in."
      : params.error === "callback"
        ? "We couldn't complete that sign-in. Try again."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to metriX.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {banner && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {banner}
          </div>
        )}
        <LoginForm redirectTo={redirectTo} />
        <p className="text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
