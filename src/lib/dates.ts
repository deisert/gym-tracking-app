/** The app's reference timezone for server-side "today" (single German user). */
const APP_TIMEZONE = "Europe/Berlin";

const MONTHS_DE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** "YYYY-MM-DD" from a Date's LOCAL fields — never via toISOString(), which is UTC. */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The Monday of the week containing `date`, as "YYYY-MM-DD". */
export function startOfWeekMonday(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (copy.getDay() + 6) % 7; // Sunday(0) -> 6, Monday(1) -> 0
  copy.setDate(copy.getDate() - daysSinceMonday);
  return localDateString(copy);
}

/** Today in the app timezone, for server components that have no client clock. */
export function todayInAppTimezone(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(now);
}

/** "2026-08-12" -> "12. Aug". Parsed by hand so no timezone can shift the day. */
export function formatPerformedOn(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(day)}. ${MONTHS_DE[Number(month) - 1]}`;
}
