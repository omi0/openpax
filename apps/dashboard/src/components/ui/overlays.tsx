import { X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./primitives";

/* ----------------------------------------------------------- scroll locking */

let locks = 0;
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = prev;
    };
  }, [active]);
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

/** Move focus into the panel when it opens and give it back on close. */
function useInitialFocus(active: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const target =
      el?.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]), select, textarea, button:not([data-close])",
      ) ?? el;
    target?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, [active, ref]);
}

const dialogSizes = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
} as const;

/**
 * Modal dialog. On phones it rises from the bottom as a sheet; on larger
 * screens it is centred. Escape and the backdrop close it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Action row pinned to the bottom of the dialog. */
  footer?: ReactNode;
  size?: keyof typeof dialogSizes;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useScrollLock(open);
  useEscape(open, onClose);
  useInitialFocus(open, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t("app.close")}
        data-close
        className="absolute inset-0 animate-fade-in cursor-default bg-stone-900/40"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-pop outline-none sm:max-h-[90vh] sm:rounded-2xl",
          "animate-slide-up sm:animate-pop-in",
          dialogSizes[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-stone-900">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-stone-500">{description}</p> : null}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label={t("app.close")}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/70 px-5 py-3 sm:px-6 sm:rounded-b-2xl">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Side panel for details: slides in from the right on wide screens and rises
 * from the bottom on phones. Non-blocking content stays visible behind it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  header,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Replaces the default title block entirely. */
  header?: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useScrollLock(open);
  useEscape(open, onClose);
  useInitialFocus(open, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        aria-label={t("app.close")}
        data-close
        className="absolute inset-0 animate-fade-in cursor-default bg-stone-900/30"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? undefined : titleId}
        aria-label={header && typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-sheet outline-none",
          "sm:h-full sm:max-h-none sm:w-[440px] sm:max-w-[92vw] sm:rounded-none sm:shadow-pop",
          "animate-slide-up sm:animate-slide-in-right",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            {header ?? (
              <>
                <h2 id={titleId} className="text-lg font-semibold text-stone-900">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-0.5 text-sm text-stone-500">{description}</p>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label={t("app.close")}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="border-t border-stone-100 bg-stone-50/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- menu */

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

/** Small popover of actions anchored to a trigger. Closes on outside click and Escape. */
export function Menu({
  trigger,
  items,
  align = "end",
  className,
}: {
  /** Receives `open` so the trigger can show a pressed state. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: Array<MenuItem | "separator">;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscape(open, close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-40 mt-1 min-w-48 animate-pop-in rounded-xl border border-stone-200 bg-white p-1.5 shadow-pop",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <div key={`sep-${i}`} className="my-1 border-t border-stone-100" />
            ) : (
              <button
                key={`${i}-${String(item.label)}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[15px] disabled:opacity-50 [&_svg]:size-4",
                  item.tone === "danger"
                    ? "text-red-700 hover:bg-red-50"
                    : "text-stone-800 hover:bg-stone-100",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- confirm */

interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "danger" | "primary";
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Replaces window.confirm with a styled dialog: `const ok = await confirm({ title })`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );
  const settle = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const variant: ButtonVariant = state?.opts.tone === "primary" ? "primary" : "danger";
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <Dialog
          open
          size="sm"
          onClose={() => settle(false)}
          title={state.opts.title}
          footer={
            <>
              <Button variant="secondary" onClick={() => settle(false)}>
                {state.opts.cancelLabel ?? t("app.cancel")}
              </Button>
              <Button variant={variant} data-autofocus onClick={() => settle(true)}>
                {state.opts.confirmLabel ?? t("app.confirm")}
              </Button>
            </>
          }
        >
          {state.opts.description ? (
            <p className="text-[15px] text-stone-600">{state.opts.description}</p>
          ) : null}
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm needs a ConfirmProvider");
  return ctx;
}
