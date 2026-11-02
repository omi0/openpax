/** Just enough RFC 5545 for a one-off meeting invite and its cancellation. */

import { instantToLocal, localToInstant } from "@openpax/core";

export interface IcsEvent {
  uid: string;
  method: "REQUEST" | "CANCEL";
  sequence: number;
  startsAt: Date;
  endsAt: Date;
  stamp: Date;
  summary: string;
  description: string;
  location: string | null;
  organizer: { email: string; name?: string };
  attendee: { email: string; name?: string };
}

const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * Guest input reaches these files through the public booking form. A line
 * break other than the escaped one, or any control character, could end the
 * event early and add properties or events of the guest's own.
 */
const stripControls = (value: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
  value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

function escapeText(value: string): string {
  return stripControls(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const param = (value: string) => `"${stripControls(value).replace(/["\n]/g, "'")}"`;

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let chunk = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(chunk + ch, "utf8") > limit) {
      parts.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  parts.push(chunk);
  return parts.join("\r\n ");
}

const cn = (p: { name?: string }) => (p.name ? `;CN=${param(p.name)}` : "");

const alarm = [
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Reminder",
  "TRIGGER:-PT1H",
  "END:VALARM",
];

export type FeedEvent = Omit<IcsEvent, "method" | "organizer" | "attendee">;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Minutes ahead of UTC in `timeZone` at that instant, from the core's zone conversion. */
function offsetMinutes(at: Date, timeZone: string): number {
  const { date, minutesOfDay } = instantToLocal(at, timeZone);
  const wall =
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) +
    minutesOfDay * MINUTE_MS;
  return Math.round((wall - Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

const offsetText = (minutes: number) => {
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${minutes < 0 ? "-" : "+"}${hh}${mm}`;
};

/** Wall-clock time as iCalendar writes it, at a fixed offset from UTC. */
const wallClock = (at: Date, offset: number) =>
  utc(new Date(at.getTime() + offset * MINUTE_MS)).slice(0, -1);

interface ZoneChange {
  at: Date;
  from: number;
  to: number;
}

/** Every feed request needs the same few years: scan each zone-year once. */
const changesCache = new Map<string, ZoneChange[]>();

function changesIn(timeZone: string, year: number): ZoneChange[] {
  const key = `${timeZone}|${year}`;
  const cached = changesCache.get(key);
  if (cached) return cached;
  const changes: ZoneChange[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let previous = offsetMinutes(new Date(t), timeZone);
  for (t += DAY_MS; t <= end; t += DAY_MS) {
    const now = offsetMinutes(new Date(t), timeZone);
    if (now === previous) continue;
    // the change happened in the last day: narrow it to the minute
    let lo = t - DAY_MS;
    let hi = t;
    while (hi - lo > MINUTE_MS) {
      const mid = lo + Math.floor((hi - lo) / (2 * MINUTE_MS)) * MINUTE_MS;
      if (offsetMinutes(new Date(mid), timeZone) === previous) lo = mid;
      else hi = mid;
    }
    changes.push({ at: new Date(hi), from: previous, to: now });
    previous = now;
  }
  changesCache.set(key, changes);
  return changes;
}

/**
 * The time zone's offsets around the meetings, a year either side, read from
 * the platform's zone data. Calendar apps take the rules from here, so a
 * meeting after the clocks change still shows at its own wall-clock time.
 */
function vtimezone(timeZone: string, from: Date, to: Date): string[] {
  const firstYear = from.getUTCFullYear() - 1;
  const lastYear = to.getUTCFullYear() + 1;
  const start = new Date(Date.UTC(firstYear, 0, 1));
  const changes: ZoneChange[] = [];
  for (let year = firstYear; year <= lastYear; year++) changes.push(...changesIn(timeZone, year));
  const first = offsetMinutes(start, timeZone);
  const lowest = Math.min(first, ...changes.map((c) => c.to));
  const block = (at: Date, offsetFrom: number, offsetTo: number) => {
    const kind = offsetTo > lowest ? "DAYLIGHT" : "STANDARD";
    return [
      `BEGIN:${kind}`,
      `DTSTART:${wallClock(at, offsetFrom)}`,
      `TZOFFSETFROM:${offsetText(offsetFrom)}`,
      `TZOFFSETTO:${offsetText(offsetTo)}`,
      `END:${kind}`,
    ];
  };
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timeZone}`,
    ...block(start, first, first),
    ...changes.flatMap((c) => block(c.at, c.from, c.to)),
    "END:VTIMEZONE",
  ];
}

/**
 * `DTSTART:…Z` in UTC, or the wall-clock time in `timeZone` when given. The
 * hour the clocks go back happens twice: a time in it stays in UTC, since the
 * wall clock alone would name the first of the two.
 */
function when(name: string, at: Date, timeZone?: string): string {
  if (timeZone) {
    const local = instantToLocal(at, timeZone);
    if (localToInstant(local.date, local.minutesOfDay, timeZone).getTime() === at.getTime())
      return `${name};TZID=${timeZone}:${wallClock(at, offsetMinutes(at, timeZone))}`;
  }
  return `${name}:${utc(at)}`;
}

function veventLines(
  e: FeedEvent,
  cancelled: boolean,
  people: string[],
  timeZone?: string,
): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.stamp)}`,
    when("DTSTART", e.startsAt, timeZone),
    when("DTEND", e.endsAt, timeZone),
    `SEQUENCE:${e.sequence}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...people,
    ...(cancelled ? [] : alarm),
    "END:VEVENT",
  ];
}

const calendar = (head: string[], events: string[][]) =>
  `${[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenPax//Meetings//EN",
    "CALSCALE:GREGORIAN",
    ...head,
    ...events.flat(),
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")}\r\n`;

export function buildIcs(e: IcsEvent): string {
  const cancelled = e.method === "CANCEL";
  return calendar(
    [`METHOD:${e.method}`],
    [
      veventLines(e, cancelled, [
        `ORGANIZER${cn(e.organizer)}:mailto:${e.organizer.email}`,
        `ATTENDEE${cn(e.attendee)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? "DECLINED" : "ACCEPTED"};RSVP=FALSE:mailto:${e.attendee.email}`,
      ]),
    ],
  );
}

/**
 * RFC 5545 wants at least one component in a calendar. A time zone is one that
 * shows up nowhere, so a feed with no meetings stays valid and empty to the host.
 */
const noEvents = [
  "BEGIN:VTIMEZONE",
  "TZID:UTC",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0000",
  "TZNAME:UTC",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * The host's subscription calendar: every live meeting, read by the calendar
 * app on its own schedule. Same UIDs as the email invites. Times are written
 * in the restaurant's zone and the calendar names it: without that, Google
 * gives a subscribed calendar UTC and shows every meeting an hour or two early.
 */
export function buildFeed(events: FeedEvent[], name: string, timeZone?: string): string {
  const zoned = timeZone !== undefined && events.length > 0;
  const body =
    events.length === 0
      ? [noEvents]
      : [
          ...(zoned
            ? [
                vtimezone(
                  timeZone,
                  new Date(Math.min(...events.map((e) => e.startsAt.getTime()))),
                  new Date(Math.max(...events.map((e) => e.endsAt.getTime()))),
                ),
              ]
            : []),
          ...events.map((e) => veventLines(e, false, [], zoned ? timeZone : undefined)),
        ];
  return calendar(
    [
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(name)}`,
      ...(timeZone ? [`X-WR-TIMEZONE:${timeZone}`] : []),
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ],
    body,
  );
}

/** "Add to Google Calendar" link, for providers that cannot attach the invite. */
export function googleCalendarLink(e: IcsEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.summary,
    dates: `${utc(e.startsAt)}/${utc(e.endsAt)}`,
    details: e.description,
    ...(e.location ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
