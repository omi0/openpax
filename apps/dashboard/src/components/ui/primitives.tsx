import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ buttons */

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200 active:bg-stone-300",
  outline:
    "border border-stone-300 bg-white text-stone-800 shadow-xs hover:bg-stone-50 active:bg-stone-100",
  ghost: "text-stone-700 hover:bg-stone-100 active:bg-stone-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 [&_svg]:size-4",
  md: "h-11 px-4 text-[15px] gap-2 [&_svg]:size-[18px]",
  lg: "h-12 px-5 text-base gap-2 [&_svg]:size-5",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon; rendered before the label. */
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Square button for a single icon; `label` is required for screen readers and the tooltip. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const dims = {
    sm: "size-9 [&_svg]:size-4",
    md: "size-11 [&_svg]:size-5",
    lg: "size-12 [&_svg]:size-6",
  }[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        dims,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- inputs */

const controlBase =
  "w-full rounded-xl border border-stone-300 bg-white text-[15px] text-stone-900 shadow-xs outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/15";

export function Input({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(controlBase, "h-11 px-3.5", className)} {...rest} />;
}

export function Textarea({
  className,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "min-h-24 px-3.5 py-2.5 leading-relaxed", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  wrapperClassName,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <select className={cn(controlBase, "h-11 appearance-none pr-10 pl-3.5", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-stone-500" />
    </span>
  );
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-stone-400" />
      <input type="search" className={cn(controlBase, "h-11 pr-3 pl-10")} {...rest} />
    </span>
  );
}

/** Label + control + hint/error. The label wraps the control so clicking it focuses the field. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-stone-700">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-600">
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-sm text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] leading-snug text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}

/** A big, tappable checkbox with a label and optional description. */
export function Checkbox({
  label,
  description,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl text-[15px] has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className="peer size-5 appearance-none rounded-md border border-stone-300 bg-white transition checked:border-brand-600 checked:bg-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2"
          {...rest}
        />
        <Check
          className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      <span className="min-w-0">
        <span className="block leading-snug">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Visible label next to the control; also the accessible name. */
  label?: ReactNode;
  /** Accessible name when there is no visible label (e.g. inside a table cell). */
  ariaLabel?: string;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? id : undefined}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "inline-block size-6 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {control}
      <span id={id} className="min-w-0 pt-0.5">
        <span className="block text-[15px] leading-snug">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Choice between a few options; replaces small groups of radio buttons or toggles. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-stretch rounded-xl border border-stone-200 bg-stone-100 p-1",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
            size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm",
            value === o.value
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-600 hover:text-stone-900",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Number input with big minus/plus buttons; easier than typing on a phone. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  name,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  name?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div
      className={cn(
        "inline-flex h-11 w-full items-stretch overflow-hidden rounded-xl border border-stone-300 bg-white shadow-xs",
        className,
      )}
    >
      <button
        type="button"
        aria-label="−"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="w-12 shrink-0 text-xl font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        name={name}
        aria-label={ariaLabel}
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="w-full min-w-0 border-x border-stone-200 text-center text-lg font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="+"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="w-12 shrink-0 text-xl font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
