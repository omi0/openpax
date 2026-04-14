import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandLockup, BrandMark } from "@/components/brand";

/**
 * Frame for login, sign-up and password pages: a calm brand panel on wide
 * screens, a single column on phones.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-stone-900 text-white lg:flex lg:w-[42%] lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-400/15"
        />
        <div className="flex items-center gap-3">
          <BrandMark size={40} className="ring-1 ring-white/20" />
          <span className="text-xl font-bold tracking-tight">OpenPax</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight">
            {t("auth.tagline")}
          </h2>
          <p className="mt-4 max-w-md text-base text-white/75">{t("auth.taglineHint")}</p>
        </div>
        <p className="text-sm text-white/50">© {new Date().getFullYear()} OpenPax</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <BrandLockup className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-[15px] text-stone-500">{subtitle}</p> : null}
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
            {children}
          </div>
          {footer ? <p className="mt-5 text-center text-[15px] text-stone-500">{footer}</p> : null}
        </div>
      </main>
    </div>
  );
}
