/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { NotificationAudience } from "@sitli/shared";
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

export function BookingEmail(p: BookingEmailProps) {
  const rows: Array<[string, string]> = [
    [p.copy.labels.when, p.vars.when],
    [p.copy.labels.party, String(p.vars.partySize)],
    [p.copy.labels.service, p.vars.serviceName],
    [p.copy.labels.code, p.vars.confirmationCode],
  ];
  if (p.audience === "restaurant") {
    rows.push([p.copy.labels.guest, p.guest.name]);
    if (p.guest.phone) rows.push([p.copy.labels.phone, p.guest.phone]);
    if (p.guest.email) rows.push([p.copy.labels.email, p.guest.email]);
  }
  if (p.notes) rows.push([p.copy.labels.notes, p.notes]);

  const href = p.audience === "guest" ? p.manageUrl : p.dashboardUrl;
  const label = p.audience === "guest" ? p.copy.button : "Sitli";

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
      <p style={{ margin: "0 0 8px" }}>{p.copy.intro(p.vars)}</p>
      <Details rows={rows} />
      {p.audience === "guest" && p.address ? (
        <p style={{ margin: "0 0 8px", color: "#52525b" }}>{p.address}</p>
      ) : null}
      {p.copy.outro ? <p style={{ margin: "12px 0 0" }}>{p.copy.outro(p.vars)}</p> : null}
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
    `${p.copy.labels.service}: ${p.vars.serviceName}`,
    `${p.copy.labels.code}: ${p.vars.confirmationCode}`,
  ];
  if (p.audience === "restaurant") {
    lines.push(`${p.copy.labels.guest}: ${p.guest.name}`);
    if (p.guest.phone) lines.push(`${p.copy.labels.phone}: ${p.guest.phone}`);
    if (p.guest.email) lines.push(`${p.copy.labels.email}: ${p.guest.email}`);
  }
  if (p.notes) lines.push(`${p.copy.labels.notes}: ${p.notes}`);
  if (p.audience === "guest" && p.address) lines.push("", p.address);
  if (p.copy.outro) lines.push("", p.copy.outro(p.vars));
  const href = p.audience === "guest" ? p.manageUrl : p.dashboardUrl;
  if (href) lines.push("", href);
  lines.push("", "--", p.copy.footer(p.vars));
  return lines.join("\n");
}
