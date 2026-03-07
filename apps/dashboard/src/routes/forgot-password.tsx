import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authSearch } from "@/lib/auth-search";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: authSearch,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { email: prefill } = Route.useSearch();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setBusy(true);
    setError(null);
    const res = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? t("app.error"));
      return;
    }
    setSent(email);
  };

  return (
    <AuthLayout
      title={t("auth.forgotTitle")}
      subtitle={t("auth.forgotHint")}
      footer={
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">{t("auth.resetSent", { email: sent })}</Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t("auth.email")}>
            <Input name="email" type="email" required autoComplete="email" defaultValue={prefill} />
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("auth.sendReset")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
