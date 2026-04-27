/**
 * Sydney-time-aware salutation. Splits the day into morning / afternoon /
 * evening / night windows. Centralised here so the dashboard, briefing, and
 * agent can all use the same wording.
 */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Hi"; // 10pm-5am — too late for "evening", too early for "morning"
}

/**
 * Picks the best display name from an auth user's metadata. Tries
 * first_name → full_name (first token) → email local part → "there".
 */
export function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null | undefined;
} | null | undefined): string {
  if (!user) return "there";
  const meta = (user.user_metadata as Record<string, unknown> | undefined) ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (first) return first;
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (full) return full.split(/\s+/)[0];
  if (user.email) return user.email.split("@")[0];
  return "there";
}
