/** Just enough RFC 5545 for a one-off meeting invite and its cancellation. */

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

function veventLines(e: FeedEvent, cancelled: boolean, people: string[]): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.stamp)}`,
    `DTSTART:${utc(e.startsAt)}`,
    `DTEND:${utc(e.endsAt)}`,
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
 * app on its own schedule. Same UIDs as the email invites.
 */
export function buildFeed(events: FeedEvent[], name: string): string {
  const body = events.length > 0 ? events.map((e) => veventLines(e, false, [])) : [noEvents];
  return calendar(
    [
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(name)}`,
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
