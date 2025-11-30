import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    await navigate({ to: "/onboarding" });
  };

  return (
    <AuthLayout
      title={t("auth.signup")}
      subtitle={t("auth.signupHint")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-brand">
            {t("auth.login")}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field label={t("auth.name")}>
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label={t("auth.email")}>
          <Input name="email" type="email" required autoComplete="email" />
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
        <Button type="submit" className="w-full" loading={busy}>
          {t("auth.signup")}
        </Button>
      </form>
    </AuthLayout>
  );
}
