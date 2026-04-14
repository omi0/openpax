/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { NotificationAudience } from "@openpax/shared";
import { Button, Details, Layout } from "../components/layout.js";
import type { CopyVars, EmailCopy } from "../i18n/copy.js";

export interface BookingEmailProps {
  copy: EmailCopy;
  vars: CopyVars;
  audience: NotificationAudience;
  primaryColor: string;
  logoUrl?: string | null;
  manageUrl?: string;
  dashboardUrl?: string;
  guest: { name: string; email: string | null; phone: string | null };
  notes?: string | null;
  address?: string | null;
}

/** Blank lines become paragraphs, single newlines become line breaks. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((para) => para.trim() !== "")
        .map((para, i) => (
          <p key={`${i}-${para.slice(0, 12)}`} style={{ margin: "0 0 8px" }}>
            {para.split("\n").map((line, j) => (
              <span key={`${j}-${line.slice(0, 12)}`}>
                {j > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        ))}
    </>
  );
}

export function BookingEmail(p: BookingEmailProps) {
  const rows: Array<[string, string]> = [
    [p.copy.labels.when, p.vars.when],
    [p.copy.labels.party, String(p.vars.partySize)],
  ];
  if (p.vars.serviceName) rows.push([p.copy.labels.service, p.vars.serviceName]);
  // waitlist messages have no booking code yet
  if (p.vars.confirmationCode) rows.push([p.copy.labels.code, p.vars.confirmationCode]);
  if (p.audience === "restaurant") {
    rows.push([p.copy.labels.guest, p.guest.name]);
    if (p.guest.phone) rows.push([p.copy.labels.phone, p.guest.phone]);
    if (p.guest.email) rows.push([p.copy.labels.email, p.guest.email]);
  }
  if (p.notes) rows.push([p.copy.labels.notes, p.notes]);

  const href = p.audience === "guest" ? p.manageUrl : p.dashboardUrl;
  const label = p.audience === "guest" ? p.copy.button : "OpenPax";

  return (
    <Layout
      title={p.copy.subject(p.vars)}
      preheader={p.copy.intro(p.vars)}
      primaryColor={p.primaryColor}
      restaurantName={p.vars.restaurantName}
      logoUrl={p.logoUrl}
      footer={p.copy.footer(p.vars)}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>{p.copy.heading(p.vars)}</h1>
      <Paragraphs text={p.copy.intro(p.vars)} />
      <Details rows={rows} />
      {p.audience === "guest" && p.address ? (
        <p style={{ margin: "0 0 8px", color: "#52525b" }}>{p.address}</p>
      ) : null}
      {href && label ? <Button href={href} label={label} color={p.primaryColor} /> : null}
    </Layout>
  );
}

export function bookingEmailText(p: BookingEmailProps): string {
  const lines = [
    p.copy.heading(p.vars),
    "",
    p.copy.intro(p.vars),
    "",
    `${p.copy.labels.when}: ${p.vars.when}`,
    `${p.copy.labels.party}: ${p.vars.partySize}`,
  ];
  if (p.vars.serviceName) lines.push(`${p.copy.labels.service}: ${p.vars.serviceName}`);
  if (p.vars.confirmationCode) lines.push(`${p.copy.labels.code}: ${p.vars.confirmationCode}`);
  if (p.audience === "restaurant") {
    lines.push(`${p.copy.labels.guest}: ${p.guest.name}`);
    if (p.guest.phone) lines.push(`${p.copy.labels.phone}: ${p.guest.phone}`);
    if (p.guest.email) lines.push(`${p.copy.labels.email}: ${p.guest.email}`);
  }
  if (p.notes) lines.push(`${p.copy.labels.notes}: ${p.notes}`);
  if (p.audience === "guest" && p.address) lines.push("", p.address);
  const href = p.audience === "guest" ? p.manageUrl : p.dashboardUrl;
  if (href) lines.push("", href);
  lines.push("", "--", p.copy.footer(p.vars));
  return lines.join("\n");
}
