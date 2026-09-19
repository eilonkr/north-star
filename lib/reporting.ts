export const reportingRanges = {
  week: "Latest published week",
  previous_week: "Previous week",
  month: "Latest published month",
  previous_month: "Previous month",
} as const;
export type ReportingRange = keyof typeof reportingRanges;
export type ReportingPeriod = {
  start: string;
  end: string;
  granularity?: "WEEKLY_SUN_SAT" | "MONTHLY";
};
const dateString = (date: Date) => date.toISOString().slice(0, 10);

export function latestPublishedWeek(now = new Date()) {
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const publication = new Date(sunday);
  publication.setUTCDate(publication.getUTCDate() + 1);
  publication.setUTCHours(7);
  if (now < publication) sunday.setUTCDate(sunday.getUTCDate() - 7);
  const start = new Date(sunday);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(sunday);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: dateString(start), end: dateString(end) };
}

export function resolveReportingPeriod(range: ReportingRange = "week", now = new Date()): ReportingPeriod {
  if (range === "month" || range === "previous_month") {
    const offset = (now.getUTCDate() >= 5 ? 1 : 2) + (range === "previous_month" ? 1 : 0);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { start: dateString(start), end: dateString(end), granularity: "MONTHLY" };
  }
  const period = latestPublishedWeek(now);
  if (range === "previous_week") {
    for (const key of ["start", "end"] as const) {
      const date = new Date(`${period[key]}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 7);
      period[key] = dateString(date);
    }
  }
  return { ...period, granularity: "WEEKLY_SUN_SAT" };
}
