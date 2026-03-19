import { WEEKDAYS } from "@sitli/core";
import {
  type BookingPolicyDto,
  MEMBER_ROLES,
  type RestaurantDto,
  SETUP_STEPS,
  type ServiceDto,
  type SetupStatusDto,
  type SetupStep,
  type UpdateRestaurantInput,
  type UpsertServiceInput,
} from "@sitli/shared";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Clock,
  Copy,
  ExternalLink,
  LayoutGrid,
  Mail,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { Suspense, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InviteForm } from "@/components/invite-form";
import { PolicyForm } from "@/components/policy-form";
import { ProviderConfigForm } from "@/components/provider-config-form";
import { RestaurantProfileForm } from "@/components/restaurant-profile-form";
import { RoomsCard } from "@/components/rooms-card";
import { defaultServiceInput, ServiceForm } from "@/components/service-form";
import { SetupShell } from "@/components/setup-shell";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  PageLoader,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import {
  areasQuery,
  meQuery,
  policyQuery,
  providerConfigQuery,
  providersQuery,
  restaurantQuery,
  servicesQuery,
  setupQuery,
  tablesQuery,
  teamQuery,
  widgetConfigQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/setup")({
  validateSearch: (search: Record<string, unknown>): { step?: SetupStep } =>
    typeof search.step === "string" && (SETUP_STEPS as readonly string[]).includes(search.step)
      ? { step: search.step as SetupStep }
      : {},
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery());
    const role = me.restaurants.find((r) => r.id === params.restaurantId)?.role ?? "staff";
    if (role === "staff") throw redirect({ to: "/r/$restaurantId/today", params });
  },
  loaderDeps: ({ search }) => ({ step: search.step }),
  // prefetch what the step shows, so the form is mounted together with its heading and buttons
  loader: async ({ context, params, deps }) => {
    const qc = context.queryClient;
    const [status] = await Promise.all([
      qc.ensureQueryData(setupQuery(params.restaurantId)),
      qc.ensureQueryData(restaurantQuery(params.restaurantId)),
    ]);
    const step = deps.step ?? status.steps.find((s) => !s.done)?.step ?? "widget";
    await prefetchStep(qc, params.restaurantId, step);
  },
  component: SetupPage,
});

/** Warm the cache with what a step reads through `useSuspenseQuery`. */
function prefetchStep(qc: QueryClient, id: string, step: SetupStep): Promise<unknown> {
  switch (step) {
    case "services":
      return qc.ensureQueryData(servicesQuery(id));
    case "rooms":
      return Promise.all([qc.ensureQueryData(areasQuery(id)), qc.ensureQueryData(tablesQuery(id))]);
    case "policy":
      return qc.ensureQueryData(policyQuery(id));
    case "notifications":
      return Promise.all([
        qc.ensureQueryData(providersQuery()),
        qc.ensureQueryData(providerConfigQuery(id, "email")),
      ]);
    case "team":
      return qc.ensureQueryData(teamQuery(id));
    case "widget":
      return qc.ensureQueryData(widgetConfigQuery(id));
    default:
      return Promise.resolve();
  }
}

type Weekday = (typeof WEEKDAYS)[number];

/** Starter services: dinner every day but Monday, lunch the same days at noon. */
function preset(kind: "lunch" | "dinner", locale: RestaurantDto["locale"]): UpsertServiceInput {
  const win = (start: string, end: string) => [{ start, end }];
  const hours =
    kind === "dinner"
      ? {
          mon: [],
          tue: win("19:00", "22:00"),
          wed: win("19:00", "22:00"),
          thu: win("19:00", "22:00"),
          fri: win("19:00", "22:30"),
          sat: win("19:00", "22:30"),
          sun: win("19:00", "22:00"),
        }
      : {
          mon: [],
          tue: win("12:00", "14:30"),
          wed: win("12:00", "14:30"),
          thu: win("12:00", "14:30"),
          fri: win("12:00", "14:30"),
          sat: win("12:00", "15:00"),
          sun: win("12:00", "15:00"),
        };
  const names = {
    it: { lunch: "Pranzo", dinner: "Cena" },
    en: { lunch: "Lunch", dinner: "Dinner" },
  };
  return {
    ...defaultServiceInput(),
    name: names[locale][kind],
    weeklyHours: hours,
    maxCoversPerSlot: 20,
  };
}

/** "Tue–Thu 19:00–22:00 · Fri–Sat 19:00–22:30" from the weekly hours. */
function describeHours(hours: ServiceDto["weeklyHours"], t: (key: string) => string): string {
  const runs: Array<{ from: Weekday; to: Weekday; text: string }> = [];
  for (const day of WEEKDAYS) {
    const windows = hours[day] ?? [];
    if (windows.length === 0) continue;
    const text = windows.map((w) => `${w.start}–${w.end}`).join(", ");
    const last = runs.at(-1);
    if (last && last.text === text && WEEKDAYS.indexOf(day) === WEEKDAYS.indexOf(last.to) + 1)
      last.to = day;
    else runs.push({ from: day, to: day, text });
  }
  return runs
    .map((r) =>
      r.from === r.to
        ? `${t(`weekday.${r.from}`)} ${r.text}`
        : `${t(`weekday.${r.from}`)}–${t(`weekday.${r.to}`)} ${r.text}`,
    )
    .join(" · ");
}

function SetupPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { step } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const toast = useToast();
  const formId = useId();
  const { data: status } = useSuspenseQuery(setupQuery(restaurantId));
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const myRole = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "manager";
  const [error, setError] = useState<string | null>(null);

  const firstOpen = status.steps.find((s) => !s.done)?.step ?? "widget";
  const current: SetupStep = step ?? firstOpen;
  const index = SETUP_STEPS.indexOf(current);
  const prev = SETUP_STEPS[index - 1] ?? null;
  const next = SETUP_STEPS[index + 1] ?? null;
  const goTo = async (s: SetupStep) => {
    setError(null);
    window.scrollTo({ top: 0 });
    await navigate({ search: { step: s } });
  };

  // the hours step starts with a form when there is nothing yet, a list afterwards
  const services = useQuery({ ...servicesQuery(restaurantId), enabled: current === "services" });
  const noServices = (services.data?.length ?? status.facts.services) === 0;

  const invalidate = (key: string) =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, key] });
  const onError = (e: unknown) =>
    setError(e instanceof ApiClientError ? e.message : t("app.error"));

  const review = useMutation({
    mutationFn: (body: { reviewed?: SetupStep[]; completed?: boolean }) =>
      api.patch<SetupStatusDto>(`/api/v1/restaurants/${restaurantId}/setup`, body),
    onSuccess: (data) => queryClient.setQueryData(setupQuery(restaurantId).queryKey, data),
    onError,
  });
  const advance = async () => {
    await review.mutateAsync({ reviewed: [current] });
    if (next) await goTo(next);
  };
  const finish = async () => {
    await review.mutateAsync({ reviewed: [current], completed: true });
    toast.success(t("setup.finished"));
    await navigate({ to: "/r/$restaurantId/today", params: { restaurantId } });
  };

  const saveRestaurant = useMutation({
    mutationFn: (body: UpdateRestaurantInput) =>
      api.patch<RestaurantDto>(`/api/v1/restaurants/${restaurantId}`, body),
    onSuccess: async () => {
      await Promise.all([invalidate("setup"), queryClient.invalidateQueries({ queryKey: ["me"] })]);
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId], exact: true });
      await advance();
    },
    onError,
  });
  const createService = useMutation({
    mutationFn: (body: UpsertServiceInput) =>
      api.post(`/api/v1/restaurants/${restaurantId}/services`, body),
    onSuccess: async () => {
      await Promise.all([invalidate("services"), invalidate("setup")]);
      await advance();
    },
    onError,
  });
  const savePolicy = useMutation({
    mutationFn: (body: BookingPolicyDto) =>
      api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, body),
    onSuccess: async () => {
      await invalidate("policy");
      await advance();
    },
    onError,
  });

  const busy = review.isPending;
  const primary: { label: string; form?: string; loading: boolean; onClick?: () => void } =
    current === "restaurant"
      ? { label: t("setup.saveContinue"), form: formId, loading: saveRestaurant.isPending || busy }
      : current === "services" && noServices
        ? { label: t("setup.saveContinue"), form: formId, loading: createService.isPending || busy }
        : current === "policy"
          ? { label: t("setup.saveContinue"), form: formId, loading: savePolicy.isPending || busy }
          : current === "widget"
            ? { label: t("setup.finish"), loading: busy, onClick: () => void finish() }
            : { label: t("setup.continue"), loading: busy, onClick: () => void advance() };

  return (
    <SetupShell
      current={current}
      status={status}
      restaurantId={restaurantId}
      footer={
        <>
          <div>
            {prev ? (
              <Button variant="ghost" icon={<ArrowLeft />} onClick={() => void goTo(prev)}>
                {t("setup.back")}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {next ? (
              <Button variant="secondary" onClick={() => void goTo(next)}>
                {t("setup.skip")}
              </Button>
            ) : (
              <Link
                to="/r/$restaurantId/today"
                params={{ restaurantId }}
                className="inline-flex h-11 items-center rounded-xl bg-stone-100 px-4 text-[15px] font-semibold text-stone-900 hover:bg-stone-200"
              >
                {t("setup.later")}
              </Link>
            )}
            {primary.form ? (
              <Button type="submit" form={primary.form} size="lg" loading={primary.loading}>
                {primary.label} <ArrowRight className="size-[18px]" />
              </Button>
            ) : (
              <Button size="lg" loading={primary.loading} onClick={primary.onClick}>
                {primary.label}{" "}
                {current === "widget" ? (
                  <Check className="size-[18px]" />
                ) : (
                  <ArrowRight className="size-[18px]" />
                )}
              </Button>
            )}
          </div>
        </>
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <Suspense fallback={<PageLoader />}>
        {current === "restaurant" ? (
          <Card>
            <RestaurantProfileForm
              key={restaurant.updatedAt}
              restaurant={restaurant}
              id={formId}
              onSubmit={(body) => {
                setError(null);
                saveRestaurant.mutate(body);
              }}
            />
          </Card>
        ) : current === "services" ? (
          <ServicesStep
            restaurantId={restaurantId}
            locale={restaurant.locale}
            formId={formId}
            onCreateFirst={(v) => {
              setError(null);
              createService.mutate(v);
            }}
          />
        ) : current === "rooms" ? (
          <RoomsStep restaurantId={restaurantId} />
        ) : current === "policy" ? (
          <PolicyStep
            restaurantId={restaurantId}
            formId={formId}
            onSubmit={(p) => {
              setError(null);
              savePolicy.mutate(p);
            }}
          />
        ) : current === "notifications" ? (
          <NotificationsStep restaurantId={restaurantId} restaurant={restaurant} />
        ) : current === "team" ? (
          <TeamStep restaurantId={restaurantId} myRole={myRole} />
        ) : (
          <GoLiveStep restaurantId={restaurantId} status={status} />
        )}
      </Suspense>
    </SetupShell>
  );
}

/* ------------------------------------------------------------------ steps */

function ServicesStep({
  restaurantId,
  locale,
  formId,
  onCreateFirst,
}: {
  restaurantId: string;
  locale: RestaurantDto["locale"];
  formId: string;
  onCreateFirst: (v: UpsertServiceInput) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialogFormId = useId();
  const { data: services } = useSuspenseQuery(servicesQuery(restaurantId));
  const [adding, setAdding] = useState<UpsertServiceInput | null>(null);
  const add = useMutation({
    mutationFn: (body: UpsertServiceInput) =>
      api.post(`/api/v1/restaurants/${restaurantId}/services`, body),
    onSuccess: async () => {
      setAdding(null);
      toast.success(t("app.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "services"] }),
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "setup"] }),
      ]);
    },
    onError: () => toast.error(t("app.error")),
  });

  if (services.length === 0)
    return (
      <Card title={t("setup.services.first")} description={t("setup.services.firstHint")}>
        <ServiceForm
          initial={preset("dinner", locale)}
          id={formId}
          onSubmit={onCreateFirst}
          submitLabel={t("setup.saveContinue")}
        />
      </Card>
    );

  return (
    <>
      <Card
        title={t("services.list")}
        description={t("setup.services.listHint")}
        flush
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-stone-500">{t("setup.services.presets")}</span>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus />}
              onClick={() => setAdding(preset("lunch", locale))}
            >
              {t("setup.services.lunch")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus />}
              onClick={() => setAdding(preset("dinner", locale))}
            >
              {t("setup.services.dinner")}
            </Button>
            <Button size="sm" icon={<Plus />} onClick={() => setAdding(defaultServiceInput())}>
              {t("services.add")}
            </Button>
          </div>
        }
      >
        <ul className="divide-y divide-stone-100">
          {services.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Clock className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {s.name}
                  {!s.active ? <Badge size="sm">{t("tables.inactive")}</Badge> : null}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {describeHours(s.weeklyHours, t) || t("services.closed")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-stone-500">
        {t("setup.services.editLater")}{" "}
        <Link
          to="/r/$restaurantId/settings/services"
          params={{ restaurantId }}
          className="font-medium text-brand-700 hover:underline"
        >
          {t("services.title")}
        </Link>
        .
      </p>
      {adding ? (
        <Dialog
          open
          onClose={() => setAdding(null)}
          title={t("services.add")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdding(null)}>
                {t("app.cancel")}
              </Button>
              <Button type="submit" form={dialogFormId} loading={add.isPending}>
                {t("app.save")}
              </Button>
            </>
          }
        >
          <ServiceForm
            initial={adding}
            id={dialogFormId}
            onSubmit={(v) => add.mutate(v)}
            submitLabel={t("app.save")}
          />
        </Dialog>
      ) : null}
    </>
  );
}

function RoomsStep({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const { data: rooms } = useSuspenseQuery(areasQuery(restaurantId));
  const { data: tables } = useSuspenseQuery(tablesQuery(restaurantId));
  return (
    <>
      <RoomsCard restaurantId={restaurantId} rooms={rooms} tables={tables} />
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <LayoutGrid className="size-5 text-brand-700" /> {t("setup.rooms.tablesTitle")}
          </span>
        }
        description={t("setup.rooms.tablesHint")}
        footer={
          <Link
            to="/r/$restaurantId/settings/tables"
            params={{ restaurantId }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
          >
            {t("setup.rooms.tablesLink")} <ArrowRight className="size-4" />
          </Link>
        }
      >
        <p className="text-[15px] text-stone-700">
          {tables.length > 0
            ? t("setup.rooms.tablesCount", { count: tables.length })
            : t("setup.rooms.noTables")}
        </p>
      </Card>
    </>
  );
}

function PolicyStep({
  restaurantId,
  formId,
  onSubmit,
}: {
  restaurantId: string;
  formId: string;
  onSubmit: (p: BookingPolicyDto) => void;
}) {
  const { data: policy } = useSuspenseQuery(policyQuery(restaurantId));
  return (
    <Card>
      <PolicyForm initial={policy} id={formId} onSubmit={onSubmit} />
    </Card>
  );
}

function NotificationsStep({
  restaurantId,
  restaurant,
}: {
  restaurantId: string;
  restaurant: RestaurantDto;
}) {
  const { t } = useTranslation();
  const { data: providers } = useSuspenseQuery(providersQuery());
  const { data: email } = useSuspenseQuery(providerConfigQuery(restaurantId, "email"));
  const providerLabel =
    providers.find((p) => p.id === email.providerId)?.label ?? email.providerId ?? "";
  return (
    <>
      {email.scope === "none" ? (
        <Alert tone="warning">{t("setup.notifications.none")}</Alert>
      ) : email.scope === "instance" ? (
        <Alert tone="info">{t("setup.notifications.instance")}</Alert>
      ) : (
        <Alert tone="success">{t("setup.notifications.ready", { provider: providerLabel })}</Alert>
      )}
      {!restaurant.email ? (
        <Alert tone="warning">
          {t("setup.notifications.noEmail")}{" "}
          <Link
            to="/r/$restaurantId/setup"
            params={{ restaurantId }}
            search={{ step: "restaurant" }}
            className="font-semibold underline"
          >
            {t("setup.steps.restaurant.label")}
          </Link>
        </Alert>
      ) : null}
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Mail className="size-5 text-brand-700" /> {t("notifications.email")}
          </span>
        }
        description={t("notifications.channelHint.email")}
        actions={
          <Badge tone={email.scope === "none" ? "neutral" : "success"}>
            {t(`notifications.scope.${email.scope}`)}
          </Badge>
        }
      >
        <ProviderConfigForm
          key={`email-${email.providerId}-${email.scope}`}
          restaurantId={restaurantId}
          channel="email"
          providers={providers.filter((p) => p.channel === "email")}
          current={email}
        />
      </Card>
      <p className="text-sm text-stone-500">
        {t("setup.notifications.smsHint")}{" "}
        <Link
          to="/r/$restaurantId/settings/notifications"
          params={{ restaurantId }}
          className="font-medium text-brand-700 hover:underline"
        >
          {t("notifications.title")}
        </Link>
        .
      </p>
    </>
  );
}

function TeamStep({ restaurantId, myRole }: { restaurantId: string; myRole: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: team } = useSuspenseQuery(teamQuery(restaurantId));
  const assignable = MEMBER_ROLES.filter((r) => r !== "owner" || myRole === "owner");
  const inviteLink = (id: string) => `${window.location.origin}/invitations/${id}`;
  return (
    <>
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <UserPlus className="size-5 text-brand-700" /> {t("team.inviteTitle")}
          </span>
        }
        description={t("team.inviteHint")}
      >
        <InviteForm restaurantId={restaurantId} assignable={assignable} />
        <p className="mt-3 text-[13px] text-stone-500">{t("team.noProviderHint")}</p>
      </Card>
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="size-5 text-brand-700" /> {t("setup.team.who")}
          </span>
        }
        flush
      >
        <ul className="divide-y divide-stone-100">
          {team.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={m.name || m.email} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {m.name || m.email}
              </span>
              <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{t(`role.${m.role}`)}</Badge>
            </li>
          ))}
          {team.invitations.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={inv.email} size="sm" className="opacity-60" />
              <span className="min-w-0 flex-1 basis-40 truncate text-[15px] text-stone-600">
                {inv.email}
              </span>
              <Badge tone="warning">{t("setup.team.invited")}</Badge>
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy />}
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteLink(inv.id));
                  toast.success(t("app.copied"));
                }}
              >
                {t("team.copyLink")}
              </Button>
            </li>
          ))}
        </ul>
        {team.members.length === 1 && team.invitations.length === 0 ? (
          <p className="px-5 py-3 text-sm text-stone-500">{t("setup.team.alone")}</p>
        ) : null}
      </Card>
    </>
  );
}

function GoLiveStep({ restaurantId, status }: { restaurantId: string; status: SetupStatusDto }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: widget } = useSuspenseQuery(widgetConfigQuery(restaurantId));
  const open = status.steps.filter((s) => !s.done && s.step !== "widget");
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("app.copied"));
  };
  return (
    <>
      {open.length > 0 ? (
        <Card
          title={t("setup.widget.checklist")}
          description={t("setup.widget.checklistHint")}
          flush
        >
          <ul className="divide-y divide-stone-100">
            {open.map((s) => (
              <li key={s.step} className="flex items-center gap-3 px-5 py-3">
                <CircleAlert className="size-5 shrink-0 text-amber-600" />
                <span className="flex-1 text-[15px] font-medium">
                  {t(`setup.steps.${s.step}.label`)}
                </span>
                <Link
                  to="/r/$restaurantId/setup"
                  params={{ restaurantId }}
                  search={{ step: s.step }}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  {t("setup.widget.fix")}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Alert tone="success">{t("setup.widget.allDone")}</Alert>
      )}
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <ExternalLink className="size-5 text-brand-700" /> {t("setup.widget.hosted")}
          </span>
        }
        description={t("setup.widget.hostedHint")}
        footer={
          <>
            <Button variant="outline" icon={<Copy />} onClick={() => void copy(widget.hostedUrl)}>
              {t("app.copy")}
            </Button>
            <a
              href={widget.hostedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white shadow-xs hover:bg-brand-700"
            >
              <ExternalLink className="size-[18px]" /> {t("setup.widget.open")}
            </a>
          </>
        }
      >
        <Input readOnly value={widget.hostedUrl} className="bg-stone-50 font-mono text-stone-700" />
        <p className="mt-3 text-sm text-stone-500">{t("setup.widget.test")}</p>
      </Card>
      <Card
        title={t("setup.widget.embed")}
        description={t("setup.widget.embedHint")}
        footer={
          <Button icon={<Copy />} onClick={() => void copy(widget.embedSnippet)}>
            {t("widget.copyCode")}
          </Button>
        }
      >
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3.5 text-[13px] leading-relaxed text-stone-100">
          {widget.embedSnippet}
        </pre>
      </Card>
    </>
  );
}
