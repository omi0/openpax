import {
  type InvitationDto,
  MEMBER_ROLES,
  type MemberRole,
  type TeamMemberDto,
} from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Mail, UserPlus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { meQuery, restaurantQuery, teamQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/team")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(teamQuery(params.restaurantId)),
  component: TeamPage,
});

const roleTone: Record<MemberRole, string> = {
  owner: "brand",
  manager: "info",
  staff: "neutral",
};

function TeamPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: team } = useSuspenseQuery(teamQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const myRole = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const canManage = myRole !== "staff";
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      toast.success(t("team.sent"));
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
  const inviteLink = (inv: InvitationDto) => `${window.location.origin}/invitations/${inv.id}`;

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="size-5 text-brand-700" /> {t("team.members")}
          </span>
        }
        description={t("team.membersHint", { organization: team.organizationName })}
        flush
      >
        <ul className="divide-y divide-stone-100">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <Avatar name={m.name || m.email} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  <span className="truncate">{m.name}</span>
                  {m.userId === me.user.id ? (
                    <Badge size="sm" tone="brand">
                      {t("team.you")}
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-sm text-stone-500">{m.email}</p>
              </div>
              {canEdit(m) ? (
                <Select
                  value={m.role}
                  wrapperClassName="w-auto"
                  className="h-10 w-auto"
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
                <Badge tone={roleTone[m.role]}>{t(`role.${m.role}`)}</Badge>
              )}
              {canEdit(m) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-stone-500 hover:text-red-700"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("team.confirmRemove", { name: m.name }),
                        confirmLabel: t("team.remove"),
                      })
                    )
                      remove.mutate(m.id);
                  }}
                >
                  {t("team.remove")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3 text-[13px] text-stone-500 sm:grid-cols-3">
          {MEMBER_ROLES.map((r) => (
            <p key={r}>
              <span className="font-semibold text-stone-700">{t(`role.${r}`)}</span> ·{" "}
              {t(`team.roles.${r}`)}
            </p>
          ))}
        </div>
      </Card>

      {canManage ? (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <UserPlus className="size-5 text-brand-700" /> {t("team.inviteTitle")}
            </span>
          }
          description={t("team.inviteHint")}
        >
          <form
            onSubmit={submitInvite}
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          >
            <Field label={t("team.email")}>
              <Input name="email" type="email" inputMode="email" required autoComplete="off" />
            </Field>
            <Field label={t("team.role")}>
              <Select name="role" defaultValue="staff" wrapperClassName="sm:w-44">
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" icon={<Mail />} loading={invite.isPending}>
              {t("team.send")}
            </Button>
          </form>
          <p className="mt-3 text-[13px] text-stone-500">{t("team.noProviderHint")}</p>
        </Card>
      ) : null}

      <Card title={t("team.pending")} flush={team.invitations.length > 0}>
        {team.invitations.length === 0 ? (
          <EmptyState icon={<Mail />}>{t("team.noPending")}</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {team.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <Avatar name={inv.email} className="opacity-60" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    <span className="truncate">{inv.email}</span>
                    <Badge size="sm" tone={roleTone[inv.role]}>
                      {t(`role.${inv.role}`)}
                    </Badge>
                  </p>
                  <p className="text-sm text-stone-500">
                    {inv.inviterName ? `${t("team.invitedBy", { name: inv.inviterName })} · ` : ""}
                    {t("team.expires", {
                      date: formatDateTime(inv.expiresAt, restaurant.timezone, i18n.language),
                    })}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-stone-400">
                    {inviteLink(inv)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <IconButton
                    size="sm"
                    label={t("team.copyLink")}
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteLink(inv));
                      toast.success(t("app.copied"));
                    }}
                  >
                    <Copy />
                  </IconButton>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-stone-500 hover:text-red-700"
                      onClick={() => cancel.mutate(inv.id)}
                    >
                      {t("team.cancel")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
