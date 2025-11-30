import type { ReactNode } from "react";

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
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white">
            S
          </span>
          <span className="text-lg font-semibold">Sitli</span>
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          {children}
        </div>
        {footer ? <p className="mt-4 text-center text-sm text-zinc-500">{footer}</p> : null}
      </div>
    </div>
  );
}
