import type { AnalyticsDto, AnalyticsTotalsDto } from "@sitli/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  ChartColumn,
  ClipboardList,
  Download,
  Percent,
  Star,
  Table,
  TrendingDown,
  TrendingUp,
  Users,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Stat,
} from "@/components/ui";
import { analyticsQuery, restaurantQuery } from "@/lib/queries";
import { addDays, cn, formatDate, todayLocal } from "@/lib/utils";

interface AnalyticsSearch {
  from?: string;
  to?: string;
}
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/_app/r/$restaurantId/analytics")({
  validateSearch: (search: Record<string, unknown>): AnalyticsSearch => ({
    ...(isDate(search.from) ? { from: search.from } : {}),
    ...(isDate(search.to) ? { to: search.to } : {}),
  }),
  component: AnalyticsPage,
});

type Preset = "7" | "30" | "90" | "month" | "lastMonth" | "next30";
const PRESETS: Preset[] = ["7", "30", "90", "month", "lastMonth", "next30"];

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "7":
      return { from: addDays(today, -6), to: today };
    case "30":
      return { from: addDays(today, -29), to: today };
    case "90":
      return { from: addDays(today, -89), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const prev = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
      const from = prev.toISOString().slice(0, 10);
      return { from, to: addDays(monthStart, -1) };
    }
    case "next30":
      return { from: today, to: addDays(today, 29) };
  }
}

const percent = (v: number | null, locale: string) =>
  v === null
    ? null
    : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(v);
const num = (v: number, locale: string, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
const signed = (v: number, locale: string, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits, signDisplay: "always" }).format(v);

/* chart ink: one brand hue for the data, stone text tokens for everything else */
const INK = {
  bar: "#1f6f5f",
  barHover: "#1a5b4e",
  track: "#f5f5f4",
  grid: "#e7e5e4",
  axis: "#d6d3d1",
  text: "#78716c",
  label: "#44403c",
};

/** Change against the previous period: relative for counts, percentage points for rates. */
function Delta({
  current,
  previous,
  kind,
  lowerIsBetter,
  locale,
}: {
  current: number | null;
  previous: number | null;
  kind: "count" | "rate";
  lowerIsBetter?: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  if (current === null || previous === null) return null;
  let label: string;
  let diff: number;
  if (kind === "rate") {
    diff = (current - previous) * 100;
    label = `${signed(diff, locale, 1)} pt`;
  } else {
    if (previous === 0) return null;
    diff = (current - previous) / previous;
    label = `${signed(diff * 100, locale, 0)}%`;
  }
  if (Math.abs(diff) < 0.05)
    return <span className="block text-[13px] text-stone-400">{t("analytics.same")}</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-medium tabular-nums",
        good ? "text-emerald-700" : "text-red-600",
      )}
    >
      {diff > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {label}
      <span className="font-normal text-stone-400">{t("analytics.vsPrevious")}</span>
    </span>
  );
}

function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const today = todayLocal(restaurant.timezone);
  const defaults = presetRange("30", today);
  const from = search.from ?? defaults.from;
  const to = search.to ?? defaults.to;
  const analytics = useQuery(analyticsQuery(restaurantId, from, to));
  const setRange = (r: { from: string; to: string }) =>
    void navigate({ search: r.from === defaults.from && r.to === defaults.to ? {} : r });
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p, today);
    return r.from === from && r.to === to;
  });
  const data = analytics.data;
  const prev: AnalyticsTotalsDto | undefined = data?.previous.totals;
  const locale = i18n.language;
  const rangeLabel = `${formatDate(from, locale, { day: "numeric", month: "short", year: "numeric" })} – ${formatDate(to, locale, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div>
      <PageHeader
        title={t("analytics.title")}
        description={rangeLabel}
        actions={
          <a
            href={`/api/v1/restaurants/${restaurantId}/analytics/export?from=${from}&to=${to}`}
            download
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
          >
            <Download className="size-[18px]" /> {t("analytics.exportCsv")}
          </a>
        }
      />

      <div className="mb-5 rounded-2xl border border-stone-200 bg-white p-3 shadow-card md:p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={activePreset === p ? "primary" : "outline"}
              onClick={() => setRange(presetRange(p, today))}
            >
              {t(`analytics.range.${p}`)}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label={t("analytics.from")}>
            <Input
              type="date"
              value={from}
              onChange={(e) => e.target.value && setRange({ from: e.target.value, to })}
            />
          </Field>
          <Field label={t("analytics.to")}>
            <Input
              type="date"
              value={to}
              onChange={(e) => e.target.value && setRange({ from, to: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {!data || !prev ? (
        <PageLoader />
      ) : (
        <div className={cn("space-y-5", analytics.isFetching && "opacity-70")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat
              label={t("analytics.kpi.bookings")}
              value={num(data.totals.bookings, locale)}
              icon={<ClipboardList />}
              tone="brand"
              hint={
                <>
                  {t("analytics.kpiHint.bookings", { cancelled: data.totals.cancelled })}
                  <br />
                  <Delta
                    current={data.totals.bookings}
                    previous={prev.bookings}
                    kind="count"
                    locale={locale}
                  />
                </>
              }
            />
            <Stat
              label={t("analytics.kpi.covers")}
              value={num(data.totals.covers, locale)}
              icon={<Users />}
              tone="brand"
              hint={
                <Delta
                  current={data.totals.covers}
                  previous={prev.covers}
                  kind="count"
                  locale={locale}
                />
              }
            />
            <Stat
              label={t("analytics.kpi.averageParty")}
              value={
                data.totals.averagePartySize === null
                  ? t("analytics.na")
                  : num(data.totals.averagePartySize, locale, 1)
              }
              icon={<Users />}
              hint={
                <Delta
                  current={data.totals.averagePartySize}
                  previous={prev.averagePartySize}
                  kind="count"
                  locale={locale}
                />
              }
            />
            <Stat
              label={t("analytics.kpi.noShowRate")}
              value={percent(data.totals.noShowRate, locale) ?? t("analytics.na")}
              icon={<UserX />}
              tone={
                data.totals.noShowRate !== null && data.totals.noShowRate > 0.1 ? "bad" : "neutral"
              }
              hint={
                <>
                  {t("analytics.kpiHint.noShowRate")}
                  <br />
                  <Delta
                    current={data.totals.noShowRate}
                    previous={prev.noShowRate}
                    kind="rate"
                    lowerIsBetter
                    locale={locale}
                  />
                </>
              }
            />
            <Stat
              label={t("analytics.kpi.cancellationRate")}
              value={percent(data.totals.cancellationRate, locale) ?? t("analytics.na")}
              icon={<Ban />}
              hint={
                <>
                  {t("analytics.kpiHint.cancellationRate", { created: data.totals.created })}
                  <br />
                  <Delta
                    current={data.totals.cancellationRate}
                    previous={prev.cancellationRate}
                    kind="rate"
                    lowerIsBetter
                    locale={locale}
                  />
                </>
              }
            />
            <Stat
              label={t("analytics.kpi.occupancy")}
              value={percent(data.totals.occupancy, locale) ?? t("analytics.na")}
              icon={<Percent />}
              tone="good"
              hint={
                <>
                  {data.totals.capacity
                    ? t("analytics.kpiHint.occupancy", {
                        capacity: num(data.totals.capacity, locale),
                      })
                    : t("analytics.kpiHint.occupancyUnknown")}
                  <br />
                  <Delta
                    current={data.totals.occupancy}
                    previous={prev.occupancy}
                    kind="rate"
                    locale={locale}
                  />
                </>
              }
            />
          </div>
          <p className="text-[13px] text-stone-500">
            {t("analytics.previousPeriod", {
              from: formatDate(data.previous.from, locale, { day: "numeric", month: "short" }),
              to: formatDate(data.previous.to, locale, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              bookings: num(prev.bookings, locale),
              covers: num(prev.covers, locale),
            })}
          </p>

          <Card title={t("analytics.coversPerDay")} description={t("analytics.coversPerDayHint")}>
            {data.totals.created === 0 ? (
              <EmptyState icon={<ChartColumn />}>{t("analytics.noData")}</EmptyState>
            ) : (
              <DailyChart data={data} restaurantId={restaurantId} />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("analytics.byService")} flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-5 py-2 font-semibold">{t("analytics.columns.service")}</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("analytics.columns.bookings")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("analytics.columns.covers")}
                      </th>
                      <th className="px-5 py-2 font-semibold">
                        {t("analytics.columns.occupancy")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.services.map((s) => {
                      const occ = s.capacity ? s.covers / s.capacity : null;
                      return (
                        <tr key={s.serviceId}>
                          <td className="px-5 py-3 text-[15px] font-semibold">{s.name}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {num(s.bookings, locale)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {num(s.covers, locale)}
                          </td>
                          <td className="px-5 py-3">
                            {occ === null ? (
                              <span className="text-stone-400">{t("analytics.na")}</span>
                            ) : (
                              <Meter value={occ} label={percent(occ, locale) ?? ""} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title={t("analytics.bySource")}>
              {data.sources.length === 0 ? (
                <EmptyState>{t("analytics.noData")}</EmptyState>
              ) : (
                <HBars
                  rows={data.sources.map((s) => ({
                    key: s.source,
                    label: t(`today.source.${s.source}`),
                    value: s.bookings,
                    detail: `${num(s.bookings, locale)} · ${num(s.covers, locale)} ${t("analytics.columns.covers").toLowerCase()}`,
                  }))}
                />
              )}
            </Card>
          </div>

          <Card title={t("analytics.byWeekday")}>
            <HBars
              rows={data.weekdays.map((w) => ({
                key: w.weekday,
                label: t(`weekday.${w.weekday}`),
                value: w.covers,
                detail: `${num(w.covers, locale)} ${t("analytics.columns.covers").toLowerCase()} · ${num(w.bookings, locale)} ${t("analytics.columns.bookings").toLowerCase()}`,
              }))}
            />
          </Card>

          {data.feedback.responses > 0 ? (
            <Card title={t("analytics.feedback")} description={t("analytics.feedbackHint")}>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <Star className="size-6 fill-amber-400 text-amber-400" />
                  </span>
                  <div>
                    <p className="text-3xl font-bold">
                      {num(data.feedback.averageRating ?? 0, locale, 1)}
                      <span className="text-base font-medium text-stone-400"> / 5</span>
                    </p>
                    <p className="text-[13px] text-stone-500">
                      {t("analytics.feedbackResponses", { count: data.feedback.responses })}
                    </p>
                  </div>
                </div>
                <div className="min-w-64 flex-1">
                  <HBars
                    rows={[5, 4, 3, 2, 1].map((n) => ({
                      key: String(n),
                      label: `${n} ★`,
                      value: data.feedback.distribution[n - 1] ?? 0,
                      detail: num(data.feedback.distribution[n - 1] ?? 0, locale),
                    }))}
                  />
                </div>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("analytics.byPartySize")} description={t("analytics.byPartySizeHint")}>
              {data.partySizes.length === 0 ? (
                <EmptyState>{t("analytics.noData")}</EmptyState>
              ) : (
                <HBars
                  rows={groupPartySizes(data.partySizes).map((p) => ({
                    key: p.label,
                    label: p.label,
                    value: p.bookings,
                    detail: `${num(p.bookings, locale)} · ${percent(p.bookings / data.totals.bookings, locale) ?? ""}`,
                  }))}
                />
              )}
            </Card>
            <Card
              title={t("analytics.leadTime")}
              description={
                data.leadTime.medianHours === null
                  ? t("analytics.leadTimeHint")
                  : t("analytics.leadTimeMedian", {
                      median: humanHours(data.leadTime.medianHours, t),
                      average: humanHours(data.leadTime.averageHours ?? 0, t),
                    })
              }
            >
              {data.totals.bookings === 0 ? (
                <EmptyState>{t("analytics.noData")}</EmptyState>
              ) : (
                <HBars
                  rows={data.leadTime.buckets.map((b) => ({
                    key: b.bucket,
                    label: t(`analytics.leadBucket.${b.bucket}`),
                    value: b.bookings,
                    detail: `${num(b.bookings, locale)} · ${percent(b.bookings / data.totals.bookings, locale) ?? ""}`,
                  }))}
                />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sizes above eight are rare enough to share one bar. */
function groupPartySizes(rows: AnalyticsDto["partySizes"]) {
  const out: Array<{ label: string; bookings: number }> = [];
  let large = 0;
  for (const r of rows) {
    if (r.partySize <= 8) out.push({ label: String(r.partySize), bookings: r.bookings });
    else large += r.bookings;
  }
  if (large > 0) out.push({ label: "9+", bookings: large });
  return out;
}

function humanHours(hours: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (hours < 1) return t("analytics.duration.minutes", { count: Math.round(hours * 60) });
  if (hours < 48) return t("analytics.duration.hours", { count: Math.round(hours) });
  return t("analytics.duration.days", { count: Math.round(hours / 24) });
}

/** Fill on a lighter step of the same hue, so the whole bar reads as one scale. */
function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-28 overflow-hidden rounded-r bg-brand-100">
        <div className="h-full rounded-r bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[13px] tabular-nums text-stone-600">{label}</span>
    </div>
  );
}

/** Horizontal single-hue bars with the value as a direct label. */
function HBars({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number; detail: string }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm"
          title={r.detail}
        >
          <span className="truncate text-[15px] text-stone-700">{r.label}</span>
          <span className="block h-3 w-full">
            <span
              className="block h-3 rounded-r bg-brand-600"
              style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-[13px] whitespace-nowrap tabular-nums text-stone-600">
            {r.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Columns of covers per day over a grey capacity track, with a hover tooltip and a table view. */
function DailyChart({ data, restaurantId }: { data: AnalyticsDto; restaurantId: string }) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const days = data.days;
  const max = Math.max(1, ...days.map((d) => Math.max(d.covers, d.capacity ?? 0)));
  const W = 960;
  const H = 220;
  const padL = 36;
  const padB = 28;
  const padT = 16;
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const band = plotW / days.length;
  const barW = Math.min(24, band * 0.7);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  const peak = days.reduce((best, d, i) => (d.covers > (days[best]?.covers ?? -1) ? i : best), 0);
  const hovered = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-56 w-full min-w-[640px]"
          role="img"
          aria-label={t("analytics.coversPerDay")}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke={INK.grid} strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={INK.text}>
                {v}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * band + (band - barW) / 2;
            const cap = d.capacity ?? 0;
            const isPeak = i === peak && d.covers > 0;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the tooltip; the table view exposes the same data
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent" />
                {cap > 0 ? (
                  <rect x={x} y={y(cap)} width={barW} height={y(0) - y(cap)} fill={INK.track} />
                ) : null}
                {d.covers > 0 ? (
                  <path
                    d={`M${x},${y(0)} V${y(d.covers) + 4} a4,4 0 0 1 4,-4 h${barW - 8} a4,4 0 0 1 4,4 V${y(0)} Z`}
                    fill={hover === i ? INK.barHover : INK.bar}
                  />
                ) : null}
                {isPeak ? (
                  <text
                    x={x + barW / 2}
                    y={y(d.covers) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill={INK.label}
                  >
                    {d.covers}
                  </text>
                ) : null}
                {i % labelEvery === 0 ? (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill={INK.text}
                  >
                    {formatDate(d.date, i18n.language, { day: "numeric", month: "short" })}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={padL} x2={W - 8} y1={y(0)} y2={y(0)} stroke={INK.axis} strokeWidth={1} />
        </svg>
        {hovered ? (
          <div className="pointer-events-none absolute top-2 right-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] shadow-pop">
            <p className="font-semibold capitalize">
              {formatDate(hovered.date, i18n.language, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
            <p className="tabular-nums">
              {hovered.covers} {t("analytics.columns.covers").toLowerCase()} · {hovered.bookings}{" "}
              {t("analytics.columns.bookings").toLowerCase()}
              {hovered.capacity
                ? ` · ${Math.round((hovered.covers / hovered.capacity) * 100)}%`
                : ""}
            </p>
            {hovered.cancelled || hovered.noShows ? (
              <p className="text-stone-500">
                {hovered.cancelled} {t("analytics.columns.cancelled").toLowerCase()} ·{" "}
                {hovered.noShows} {t("analytics.columns.noShows").toLowerCase()}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          variant="ghost"
          icon={<Table />}
          aria-expanded={table}
          onClick={() => setTable(!table)}
        >
          {table ? t("analytics.hideTable") : t("analytics.tableView")}
        </Button>
      </div>
      {table ? (
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("analytics.columns.date")}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t("analytics.columns.bookings")}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t("analytics.columns.covers")}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t("analytics.columns.cancelled")}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t("analytics.columns.noShows")}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t("analytics.columns.capacity")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {days.map((d) => (
                <tr key={d.date} className="hover:bg-stone-50">
                  <td className="px-3 py-1.5">
                    <Link
                      to="/r/$restaurantId/today"
                      params={{ restaurantId }}
                      search={{ date: d.date }}
                      className="font-medium capitalize hover:text-brand-700"
                    >
                      {formatDate(d.date, i18n.language, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.bookings}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.covers}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.cancelled}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.noShows}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">
                    {d.capacity ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
