import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authSearch, continueOAuth } from "@/lib/auth-search";
import { authConfigQuery } from "@/lib/queries";

export const Route = createFileRoute("/signup")({
  validateSearch: authSearch,
  component: SignupPage,
});

function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { redirect, email } = Route.useSearch();
  const authConfig = useQuery(authConfigQuery());
  // invited people arrive with their email in the link and may sign up on a closed instance
  const closed = authConfig.data ? !authConfig.data.signupOpen && !email : false;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? t("app.error"));
      return;
    }
    if (continueOAuth(res.data)) return;
    await navigate({ to: redirect ?? "/onboarding" });
  };

  return (
    <AuthLayout
      title={t("auth.signup")}
      subtitle={t("auth.signupHint")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link
            to="/login"
            search={{ redirect, email }}
            className="font-semibold text-brand-700 hover:underline"
          >
            {t("auth.login")}
          </Link>
        </>
      }
    >
      {closed ? (
        <div className="space-y-2 text-[15px]">
          <p className="font-medium">{t("auth.closed")}</p>
          <p className="text-stone-500">{t("auth.closedHint")}</p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t("auth.name")}>
            <Input name="name" required autoComplete="name" />
          </Field>
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required autoComplete="email" defaultValue={email} />
          </Field>
          <Field label={t("auth.password")}>
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("auth.signup")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
