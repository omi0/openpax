import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SlotOption {
  key: string;
  serviceId: string;
  /** Wall-clock label, e.g. "19:30". */
  label: string;
  available: boolean;
  reason?: string;
  /** The booking's own slot when editing. */
  current?: boolean;
}

/**
 * Time slots as tappable chips, grouped by service when there is more than
 * one. Unavailable slots are greyed out; managers may still pick them when
 * `allowUnavailable` is set (the API then needs ignoreCapacity).
 */
export function SlotPicker({
  options,
  services,
  value,
  onChange,
  allowUnavailable,
  emptyLabel,
}: {
  options: SlotOption[];
  services: Array<{ id: string; name: string }>;
  value: string;
  onChange: (key: string) => void;
  allowUnavailable: boolean;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  if (options.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">
        {emptyLabel}
      </p>
    );
  const groups =
    services.length > 1
      ? services
          .map((s) => ({ service: s, options: options.filter((o) => o.serviceId === s.id) }))
          .filter((g) => g.options.length > 0)
      : [{ service: null, options }];
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.service?.id ?? "all"}>
          {g.service ? (
            <p className="mb-1.5 text-[13px] font-semibold text-stone-500 uppercase tracking-wide">
              {g.service.name}
            </p>
          ) : null}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {g.options.map((o) => {
              const selected = o.key === value;
              const pickable = o.available || o.current || allowUnavailable;
              const reason = o.reason
                ? t(`today.form.reason.${o.reason}`, { defaultValue: o.reason })
                : undefined;
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={!pickable}
                  aria-pressed={selected}
                  title={!o.available && !o.current ? reason : undefined}
                  onClick={() => onChange(o.key)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center rounded-xl border text-[15px] font-semibold tabular-nums transition-colors",
                    selected
                      ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                      : o.available || o.current
                        ? "border-stone-300 bg-white text-stone-800 hover:border-brand-400 hover:bg-brand-50"
                        : pickable
                          ? "border-dashed border-amber-400 bg-amber-50 text-amber-800"
                          : "border-stone-200 bg-stone-50 text-stone-400 line-through",
                  )}
                >
                  {o.label}
                  {!o.available && !o.current && reason ? (
                    <span
                      className={cn(
                        "max-w-full truncate text-[10px] font-normal no-underline",
                        selected ? "text-white/80" : "text-stone-500",
                      )}
                    >
                      {reason}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
