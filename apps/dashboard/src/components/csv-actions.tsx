import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog } from "@/components/ui";
import { ApiClientError } from "@/lib/api";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  dryRun: boolean;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
}

const TEMPLATES = {
  bookings:
    "date,time,guests,name,email,phone,service,status,notes,source,room\r\n2025-03-14,20:00,4,Mario Rossi,mario@example.com,+39 333 1234567,Cena,completed,Compleanno,phone,Sala\r\n",
  customers:
    'name,email,phone,tags,notes,locale,marketing_consent\r\nMario Rossi,mario@example.com,+39 333 1234567,"vip,regular",Tavolo vicino alla finestra,it,true\r\n',
} as const;

/** Export link (current filters) and an import dialog for bookings or guests. */
export function CsvActions({
  kind,
  restaurantId,
  exportQuery,
  onImported,
}: {
  kind: "bookings" | "customers";
  restaurantId: string;
  exportQuery: Record<string, string | undefined>;
  onImported: () => unknown;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(exportQuery)) if (v) params.set(k, v);
  const query = params.toString();
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/api/v1/restaurants/${restaurantId}/${kind}/export${query ? `?${query}` : ""}`}
        download
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
      >
        <Download className="size-[18px]" /> {t("csv.export")}
      </a>
      <Button variant="outline" icon={<Upload />} onClick={() => setOpen(true)}>
        {t("csv.import")}
      </Button>
      {open ? (
        <ImportDialog
          kind={kind}
          restaurantId={restaurantId}
          onClose={() => setOpen(false)}
          onImported={onImported}
        />
      ) : null}
    </div>
  );
}

function ImportDialog({
  kind,
  restaurantId,
  onClose,
  onImported,
}: {
  kind: "bookings" | "customers";
  restaurantId: string;
  onClose: () => void;
  onImported: () => unknown;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/${kind}/import?dryRun=${dryRun ? "1" : "0"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "text/csv; charset=utf-8", accept: "application/json" },
          body: text ?? "",
        },
      );
      const body = (await res.json()) as ImportResult & { code?: string; message?: string };
      if (!res.ok) throw new ApiClientError(res.status, body.code ?? "error", body.message ?? "");
      return body;
    },
    onSuccess: (r) => {
      setResult(r);
      if (!r.dryRun) void onImported();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const pick = (file: File | undefined) => {
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    void file.text().then(setText);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`csv.importTitle.${kind}`)}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.close")}
          </Button>
          <Button
            variant="outline"
            disabled={!text}
            loading={run.isPending && run.variables === true}
            onClick={() => run.mutate(true)}
          >
            {t("csv.dryRun")}
          </Button>
          <Button
            disabled={!text}
            loading={run.isPending && run.variables === false}
            onClick={() => run.mutate(false)}
          >
            {t("csv.run")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-stone-600">{t(`csv.hint.${kind}`)}</p>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[kind])}`}
          download={`openpax-${kind}-template.csv`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <Download className="size-4" /> {t("csv.template")}
        </a>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/60 px-4 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 focus-within:border-brand-500">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-card">
            <FileSpreadsheet className="size-6" />
          </span>
          <span className="text-[15px] font-semibold text-stone-800">{t("csv.file")}</span>
          <span className="text-sm text-stone-500">{fileName ? fileName : t("csv.drop")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => pick(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <Alert tone={result.errors.length > 0 ? "warning" : "success"}>
            <p className="font-semibold">{result.dryRun ? t("csv.preview") : t("csv.done")}</p>
            <p>
              {t("csv.result", {
                created: result.created,
                updated: result.updated,
                skipped: result.skipped,
              })}
            </p>
            {result.errors.length > 0 ? (
              <ImportNotes title={t("csv.errors")} items={result.errors} />
            ) : null}
            {result.warnings?.length > 0 ? (
              <ImportNotes title={t("csv.warnings")} items={result.warnings} />
            ) : null}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

function ImportNotes({
  title,
  items,
}: {
  title: string;
  items: Array<{ line: number; message: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <ul className="mt-1 max-h-48 list-disc overflow-auto pl-4 text-[13px]">
        {items.map((e) => (
          <li key={`${e.line}-${e.message}`}>
            {t("csv.line", { line: e.line })}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
