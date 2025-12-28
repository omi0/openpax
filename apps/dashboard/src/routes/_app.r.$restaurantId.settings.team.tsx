import {
  type InvitationDto,
  MEMBER_ROLES,
  type MemberRole,
  type TeamMemberDto,
} from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { meQuery, restaurantQuery, teamQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/team")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(teamQuery(params.restaurantId)),
  component: TeamPage,
});

function TeamPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: team } = useSuspenseQuery(teamQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const myRole = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const canManage = myRole !== "staff";
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "team"] });
  const onError = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === "already_member")
      setError(t("team.alreadyMember"));
    else setError(e instanceof ApiClientError ? e.message : t("app.error"));
  };

  const invite = useMutation({
    mutationFn: (body: { email: string; role: MemberRole }) =>
      api.post<InvitationDto>(`/api/v1/restaurants/${restaurantId}/team/invitations`, body),
    onSuccess: async () => {
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      await invalidate();
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/restaurants/${restaurantId}/team/invitations/${id}`),
    onSuccess: invalidate,
    onError,
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) =>
      api.patch<TeamMemberDto>(`/api/v1/restaurants/${restaurantId}/team/members/${id}`, {
        role,
      }),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/restaurants/${restaurantId}/team/members/${id}`),
    onSuccess: invalidate,
    onError,
  });

  const submitInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    invite.mutate(
      { email: String(f.get("email")), role: String(f.get("role")) as MemberRole },
      { onSuccess: () => e.currentTarget?.reset?.() },
    );
  };
  const assignable = MEMBER_ROLES.filter((r) => r !== "owner" || myRole === "owner");
  const canEdit = (m: TeamMemberDto) =>
    canManage && m.userId !== me.user.id && (m.role !== "owner" || myRole === "owner");

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Card
        title={t("team.members")}
        description={t("team.membersHint", { organization: team.organizationName })}
      >
        <ul className="divide-y divide-zinc-100">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.name}
                  {m.userId === me.user.id ? (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      ({t("team.you")})
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-zinc-500">{m.email}</p>
              </div>
              {canEdit(m) ? (
                <Select
                  value={m.role}
                  className="h-8 w-auto"
                  aria-label={t("team.role")}
                  disabled={changeRole.isPending}
                  onChange={(e) =>
                    changeRole.mutate({ id: m.id, role: e.target.value as MemberRole })
                  }
                >
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge>{t(`role.${m.role}`)}</Badge>
              )}
              {canEdit(m) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(t("team.confirmRemove", { name: m.name })))
                      remove.mutate(m.id);
                  }}
                >
                  {t("team.remove")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {canManage ? (
        <Card title={t("team.inviteTitle")} description={t("team.inviteHint")}>
          <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-3">
            <Field label={t("team.email")} className="min-w-60 flex-1">
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label={t("team.role")}>
              <Select name="role" defaultValue="staff">
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={invite.isPending}>
              {t("team.send")}
            </Button>
            {sent ? <span className="text-sm text-emerald-700">{t("team.sent")}</span> : null}
          </form>
          <p className="mt-3 text-xs text-zinc-500">{t("team.noProviderHint")}</p>
        </Card>
      ) : null}

      <Card title={t("team.pending")}>
        {team.invitations.length === 0 ? (
          <EmptyState>{t("team.noPending")}</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {team.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {inv.email} <Badge>{t(`role.${inv.role}`)}</Badge>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {inv.inviterName ? `${t("team.invitedBy", { name: inv.inviterName })} · ` : ""}
                    {t("team.expires", {
                      date: formatDateTime(inv.expiresAt, restaurant.timezone, i18n.language),
                    })}
                  </p>
                  <p className="truncate font-mono text-xs text-zinc-400">
                    {`${window.location.origin}/invitations/${inv.id}`}
                  </p>
                </div>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => cancel.mutate(inv.id)}>
                    {t("team.cancel")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
