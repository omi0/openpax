import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Spinner } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { invitationQuery } from "@/lib/queries";

export const Route = createFileRoute("/invitations/$invitationId")({
  loader: async () => {
    const session = await authClient.getSession();
    return { sessionEmail: session.data?.user.email ?? null };
  },
  component: InvitationPage,
});

function InvitationPage() {
  const { t } = useTranslation();
  const { invitationId } = Route.useParams();
  const { sessionEmail } = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invitation = useQuery(invitationQuery(invitationId));
  const accept = useMutation({
    mutationFn: () =>
      api.post<{ organizationId: string }>(`/api/v1/invitations/${invitationId}/accept`),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/" });
    },
  });
  const logout = async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/login", search: { redirect: `/invitations/${invitationId}` } });
  };

  const inv = invitation.data;
  const here = `/invitations/${invitationId}`;
  let body: React.ReactNode;
  if (invitation.isLoading)
    body = (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  else if (!inv)
    body = (
      <Alert>
        {invitation.error instanceof ApiClientError && invitation.error.status === 404
          ? t("invite.notFound")
          : t("app.error")}
      </Alert>
    );
  else if (inv.status === "expired") body = <Alert>{t("invite.expired")}</Alert>;
  else if (inv.status !== "pending") body = <Alert>{t("invite.used")}</Alert>;
  else {
    const role = t(`role.${inv.role}`);
    const intro = inv.inviterName
      ? t("invite.intro", { inviter: inv.inviterName, organization: inv.organizationName, role })
      : t("invite.introNoInviter", { organization: inv.organizationName, role });
    const sameAccount = sessionEmail?.toLowerCase() === inv.email.toLowerCase();
    body = (
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed">{intro}</p>
        {sessionEmail && sameAccount ? (
          <>
            {accept.error ? (
              <Alert>
                {accept.error instanceof ApiClientError ? accept.error.message : t("app.error")}
              </Alert>
            ) : null}
            <Button
              size="lg"
              className="w-full"
              loading={accept.isPending}
              onClick={() => accept.mutate()}
            >
              {accept.isPending ? t("invite.accepting") : t("invite.accept")}
            </Button>
          </>
        ) : sessionEmail ? (
          <>
            <Alert tone="info">
              {t("invite.wrongAccount", { current: sessionEmail, email: inv.email })}
            </Alert>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => void logout()}>
              {t("invite.logout")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-[15px] text-stone-500">
              {t("invite.signupFirst", { email: inv.email })}
            </p>
            <Link
              to="/signup"
              search={{ redirect: here, email: inv.email }}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              {t("invite.signup")}
            </Link>
            <Link
              to="/login"
              search={{ redirect: here, email: inv.email }}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-base font-semibold text-stone-800 hover:bg-stone-50"
            >
              {t("invite.login")}
            </Link>
          </>
        )}
      </div>
    );
  }

  return <AuthLayout title={t("invite.title")}>{body}</AuthLayout>;
}
