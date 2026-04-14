import type { InvitationDto, MemberRole } from "@openpax/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, Select, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";

/** Email + role → invitation. Refreshes the team query and toasts on success. */
export function InviteForm({
  restaurantId,
  assignable,
  onSent,
}: {
  restaurantId: string;
  assignable: readonly MemberRole[];
  onSent?: (invitation: InvitationDto) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (body: { email: string; role: MemberRole }) =>
      api.post<InvitationDto>(`/api/v1/restaurants/${restaurantId}/team/invitations`, body),
    onSuccess: async (inv) => {
      setError(null);
      toast.success(t("team.sent"));
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "team"] });
      onSent?.(inv);
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === "already_member")
        setError(t("team.alreadyMember"));
      else setError(e instanceof ApiClientError ? e.message : t("app.error"));
    },
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    invite.mutate(
      { email: String(f.get("email")), role: String(f.get("role")) as MemberRole },
      { onSuccess: () => form.reset() },
    );
  };
  return (
    <div className="space-y-3">
      <form
        onSubmit={submit}
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
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
