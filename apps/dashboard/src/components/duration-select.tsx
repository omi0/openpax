import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui";
import { formatDuration } from "@/lib/utils";

/**
 * A duration picked from a list of sensible values ("30 min", "1 h 30 min",
 * "2 days") instead of a bare number of minutes. A stored value that is not
 * in the list is kept as an extra option so nothing changes behind the
 * owner's back.
 */
export function DurationSelect({
  value,
  onChange,
  options,
  disabled,
  none,
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** Choices, in minutes, ascending. */
  options: number[];
  disabled?: boolean;
  /** Label for 0 (e.g. "No notice needed"); without it 0 reads "0 min". */
  none?: string;
}) {
  const { t, i18n } = useTranslation();
  const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  const label = (m: number) =>
    m === 0 && none
      ? none
      : formatDuration(m, i18n.language, (count) => t("duration.days", { count }));
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {values.map((m) => (
        <option key={m} value={m}>
          {label(m)}
        </option>
      ))}
    </Select>
  );
}

/** Minutes of notice / cut-off: none, then half hours up to two days. */
export const NOTICE_OPTIONS = [0, 30, 60, 90, 120, 180, 240, 360, 720, 1440, 2880];
/** How long a table stays taken. */
export const TURN_OPTIONS = [45, 60, 75, 90, 105, 120, 150, 180, 240];
/** Distance between bookable arrival times. */
export const INTERVAL_OPTIONS = [15, 20, 30, 45, 60];
/** How long a waitlist offer stays open. */
export const OFFER_OPTIONS = [15, 30, 60, 120, 240, 720, 1440];
