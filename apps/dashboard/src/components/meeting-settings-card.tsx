import type { BookingPolicyDto, UpdateBookingPolicyInput } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WeeklyHoursEditor } from "@/components/service-form";
import { Alert, Button, Card, Field, Input, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { policyQuery } from "@/lib/queries";

/** Who meets large groups (the chef), their address for invites, and when they are free. */
export function MeetingSettingsCard({
  restaurantId,
  canManage,
}: {
  restaurantId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const policy = useQuery(policyQuery(restaurantId));
  const [minParty, setMinParty] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostEmail, setHostEmail] = useState("");
  const [hours, setHours] = useState<BookingPolicyDto["meetingHours"]>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const p = policy.data;
    if (!p) return;
    setMinParty(p.meetingMinPartySize === null ? "" : String(p.meetingMinPartySize));
    setHostName(p.meetingHostName ?? "");
    setHostEmail(p.meetingHostEmail ?? "");
    setHours(p.meetingHours);
  }, [policy.data]);

  const save = useMutation({
    mutationFn: (body: UpdateBookingPolicyInput) =>
      api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(policyQuery(restaurantId).queryKey, updated);
      toast.success(t("app.saved"));
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    save.mutate({
      meetingMinPartySize: minParty === "" ? null : Number(minParty),
      meetingHostName: hostName.trim() || null,
      meetingHostEmail: hostEmail.trim() || null,
      meetingHours: hours,
    });
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <ChefHat className="size-5 text-brand-700" /> {t("meetings.settingsTitle")}
        </span>
      }
      description={t("meetings.settingsHint")}
    >
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-3">
          <Field label={t("meetings.minParty")} hint={t("meetings.minPartyHint")}>
            <Input
              type="number"
              min={2}
              max={1000}
              value={minParty}
              onChange={(e) => setMinParty(e.target.value)}
            />
          </Field>
          <Field label={t("meetings.hostName")}>
            <Input value={hostName} maxLength={80} onChange={(e) => setHostName(e.target.value)} />
          </Field>
          <Field label={t("meetings.hostEmail")} hint={t("meetings.hostEmailHint")}>
            <Input type="email" value={hostEmail} onChange={(e) => setHostEmail(e.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-1.5 text-sm font-medium text-stone-700">{t("meetings.hours")}</p>
            <p className="mb-2 text-[13px] text-stone-500">{t("meetings.hoursHint")}</p>
            <WeeklyHoursEditor value={hours} onChange={setHours} />
          </div>
        </fieldset>
        {error ? <Alert>{error}</Alert> : null}
        {canManage ? (
          <Button type="submit" loading={save.isPending}>
            {t("app.save")}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
