import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

interface ResetSearch {
  token?: string;
  error?: string;
}

export const Route = createFileRoute("/reset-password")({
  // Better Auth redirects here as /reset-password?token=... or ?error=INVALID_TOKEN
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    ...(typeof search.token === "string" && search.token ? { token: search.token } : {}),
    ...(typeof search.error === "string" && search.error ? { error: search.error } : {}),
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token, error: linkError } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password !== String(f.get("confirm"))) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (res.error) {
      setError(
        res.error.code === "INVALID_TOKEN"
          ? t("auth.resetInvalid")
          : (res.error.message ?? t("app.error")),
      );
      return;
    }
    setDone(true);
  };

  const invalid = !token || !!linkError;

  return (
    <AuthLayout
      title={t("auth.resetTitle")}
      footer={
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      {done ? (
        <Alert tone="success">{t("auth.resetDone")}</Alert>
      ) : invalid ? (
        <div className="space-y-3">
          <Alert>{t("auth.resetInvalid")}</Alert>
          <Link
            to="/forgot-password"
            className="block text-center text-[15px] font-semibold text-brand-700 hover:underline"
          >
            {t("auth.forgotTitle")}
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label={t("auth.newPassword")}>
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label={t("auth.confirmPassword")}>
            <Input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("auth.setPassword")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
