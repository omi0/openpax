import type { BookingPolicyDto, MeetingFeedDto, UpdateBookingPolicyInput } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChefHat, Copy, RefreshCw } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WeeklyHoursEditor } from "@/components/service-form";
import {
  Alert,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { meetingFeedQuery, policyQuery } from "@/lib/queries";

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
  // unsaved edits win over cache updates (the operators card saves the same policy)
  const [dirty, setDirty] = useState(false);
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setDirty(true);
      set(v);
    };
  useEffect(() => {
    const p = policy.data;
    if (!p || dirty) return;
    setMinParty(p.meetingMinPartySize === null ? "" : String(p.meetingMinPartySize));
    setHostName(p.meetingHostName ?? "");
    setHostEmail(p.meetingHostEmail ?? "");
    setHours(p.meetingHours);
  }, [policy.data, dirty]);

  const save = useMutation({
    mutationFn: (body: UpdateBookingPolicyInput) =>
      api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(policyQuery(restaurantId).queryKey, updated);
      setDirty(false);
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
              onChange={(e) => edit(setMinParty)(e.target.value)}
            />
          </Field>
          <Field label={t("meetings.hostName")}>
            <Input
              value={hostName}
              maxLength={80}
              onChange={(e) => edit(setHostName)(e.target.value)}
            />
          </Field>
          <Field label={t("meetings.hostEmail")} hint={t("meetings.hostEmailHint")}>
            <Input
              type="email"
              value={hostEmail}
              onChange={(e) => edit(setHostEmail)(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-1.5 text-sm font-medium text-stone-700">{t("meetings.hours")}</p>
            <p className="mb-2 text-[13px] text-stone-500">{t("meetings.hoursHint")}</p>
            <WeeklyHoursEditor value={hours} onChange={edit(setHours)} />
          </div>
        </fieldset>
        {error ? <Alert>{error}</Alert> : null}
        {canManage ? (
          <Button type="submit" loading={save.isPending}>
            {t("app.save")}
          </Button>
        ) : null}
      </form>
      {canManage ? <MeetingFeedSection restaurantId={restaurantId} /> : null}
    </Card>
  );
}

/** A secret link the chef adds once to Google Calendar: every meeting shows up there, no email needed. */
function MeetingFeedSection({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const path = `/api/v1/restaurants/${restaurantId}/meetings/feed`;
  const feed = useQuery(meetingFeedQuery(restaurantId));
  const change = useMutation({
    mutationFn: (on: boolean) =>
      on ? api.post<MeetingFeedDto>(path, {}) : api.delete<MeetingFeedDto>(path),
    onSuccess: (updated) =>
      queryClient.setQueryData(meetingFeedQuery(restaurantId).queryKey, updated),
    onError: (e) => toast.error(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const url = feed.data?.url ?? null;

  return (
    <div className="mt-6 space-y-3 border-t border-stone-200 pt-5">
      <div>
        <p className="text-sm font-medium text-stone-700">{t("meetings.feedTitle")}</p>
        <p className="mt-1 text-[13px] text-stone-500">{t("meetings.feedHint")}</p>
      </div>
      {url ? (
        <>
          <div className="flex gap-2">
            <Input
              value={url}
              readOnly
              aria-label={t("meetings.feedLink")}
              className="bg-stone-50 font-mono text-[13px] text-stone-600"
            />
            <IconButton
              label={t("app.copy")}
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                toast.success(t("app.copied"));
              }}
            >
              <Copy />
            </IconButton>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-stone-600">
            <li>{t("meetings.feedStep1")}</li>
            <li>{t("meetings.feedStep2")}</li>
            <li>{t("meetings.feedStep3")}</li>
          </ol>
          <p className="text-[13px] text-stone-500">{t("meetings.feedDelay")}</p>
          <Alert tone="warning">{t("meetings.feedPrivate")}</Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw />}
              disabled={change.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: t("meetings.feedRotate"),
                    description: t("meetings.feedRotateConfirm"),
                    confirmLabel: t("meetings.feedRotate"),
                  })
                )
                  change.mutate(true);
              }}
            >
              {t("meetings.feedRotate")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-stone-500 hover:text-red-700"
              disabled={change.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: t("meetings.feedOff"),
                    description: t("meetings.feedOffConfirm"),
                    confirmLabel: t("meetings.feedOff"),
                  })
                )
                  change.mutate(false);
              }}
            >
              {t("meetings.feedOff")}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          icon={<CalendarPlus />}
          loading={change.isPending}
          disabled={feed.isPending}
          onClick={() => change.mutate(true)}
        >
          {t("meetings.feedCreate")}
        </Button>
      )}
    </div>
  );
}
