import type { BookingPolicyDto } from "@sitli/shared";
import { Hourglass } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DurationSelect, NOTICE_OPTIONS, OFFER_OPTIONS } from "@/components/duration-select";
import { Button, Field, Input, Switch } from "@/components/ui";

const numOrNull = (v: string) => (v === "" ? null : Number(v));

/**
 * The booking rules guests meet online: notice, horizon, party sizes,
 * approval and the waitlist. The host saves; with `id` it also renders the
 * submit button via `form={id}`.
 */
export function PolicyForm({
  initial,
  onSubmit,
  busy,
  id,
  submitLabel,
}: {
  initial: BookingPolicyDto;
  onSubmit: (policy: BookingPolicyDto) => void;
  busy?: boolean;
  id?: string;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const [p, setP] = useState<BookingPolicyDto>({ ...initial });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(p);
  };
  return (
    <form id={id} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label={t("widget.minLead")} hint={t("widget.minLeadHint")}>
        <DurationSelect
          value={p.minLeadMinutes}
          options={NOTICE_OPTIONS}
          none={t("widget.noNotice")}
          onChange={(minLeadMinutes) => setP({ ...p, minLeadMinutes })}
        />
      </Field>
      <Field label={t("widget.maxAdvance")} hint={t("widget.maxAdvanceHint")}>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={730}
          value={p.maxAdvanceDays}
          onChange={(e) => setP({ ...p, maxAdvanceDays: Number(e.target.value) })}
        />
      </Field>
      <Field label={t("widget.minParty")}>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={p.minPartySize}
          onChange={(e) => setP({ ...p, minPartySize: Number(e.target.value) })}
        />
      </Field>
      <Field label={t("widget.maxParty")}>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={p.maxPartySize}
          onChange={(e) => setP({ ...p, maxPartySize: Number(e.target.value) })}
        />
      </Field>
      <Field label={t("widget.cutoff")} hint={t("widget.cutoffHint")}>
        <DurationSelect
          value={p.cancellationCutoffMinutes}
          options={NOTICE_OPTIONS}
          none={t("widget.noCutoff")}
          onChange={(cancellationCutoffMinutes) => setP({ ...p, cancellationCutoffMinutes })}
        />
      </Field>
      <Field label={t("widget.largeParty")} hint={t("widget.largePartyHint")}>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={p.largePartyThreshold ?? ""}
          onChange={(e) => setP({ ...p, largePartyThreshold: numOrNull(e.target.value) })}
        />
      </Field>
      <div className="sm:col-span-2">
        <Switch
          checked={p.autoConfirm}
          onChange={(autoConfirm) => setP({ ...p, autoConfirm })}
          label={t("widget.autoConfirm")}
        />
      </div>
      <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:col-span-2">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Hourglass className="size-[18px] text-brand-700" /> {t("widget.waitlist")}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-stone-500">{t("widget.waitlistHint")}</p>
        </div>
        <Switch
          checked={p.waitlistEnabled}
          onChange={(waitlistEnabled) => setP({ ...p, waitlistEnabled })}
          label={t("widget.waitlistEnabled")}
        />
        <Switch
          checked={p.waitlistAutoOffer}
          onChange={(waitlistAutoOffer) => setP({ ...p, waitlistAutoOffer })}
          label={t("widget.waitlistAutoOffer")}
          disabled={!p.waitlistEnabled}
        />
        <Field label={t("widget.waitlistOfferMinutes")} className="sm:max-w-xs">
          <DurationSelect
            value={p.waitlistOfferMinutes}
            options={OFFER_OPTIONS}
            disabled={!p.waitlistEnabled}
            onChange={(waitlistOfferMinutes) => setP({ ...p, waitlistOfferMinutes })}
          />
        </Field>
      </div>
      {id ? null : (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={busy}>
            {submitLabel ?? t("app.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
