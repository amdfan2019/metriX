import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchUserBudgetSettings } from "@/lib/budgets/income";
import { OnboardingWizard } from "./onboarding-wizard";

/**
 * One-page onboarding flow. New users land here from the dashboard CTA when
 * they don't have a monthly income on file. Once they submit, settings + a
 * full set of budget caps are saved in one shot and they're sent to /dashboard.
 *
 * Already onboarded? We bounce back to the dashboard — re-running the wizard
 * isn't dangerous, but the settings page is the right place to edit later.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settings = await fetchUserBudgetSettings();
  if (settings.monthlyIncomeCents != null && settings.monthlyIncomeCents > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to metriX</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A few numbers and we&apos;ll tee up your budgets. You can adjust everything later.
        </p>
      </header>
      <OnboardingWizard />
    </div>
  );
}
