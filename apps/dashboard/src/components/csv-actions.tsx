import { useMutation } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
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
}

const TEMPLATES = {
  bookings:
    "date,time,guests,name,email,phone,service,status,notes,source\r\n2025-03-14,20:00,4,Mario Rossi,mario@example.com,+39 333 1234567,Cena,completed,Compleanno,phone\r\n",
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
    <div className="ml-auto flex items-center gap-2">
      <a
        href={`/api/v1/restaurants/${restaurantId}/${kind}/export${query ? `?${query}` : ""}`}
        download
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
      >
        <Download className="size-4" /> {t("csv.export")}
      </a>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> {t("csv.import")}
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
    <Dialog open onClose={onClose} title={t(`csv.importTitle.${kind}`)} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600">{t(`csv.hint.${kind}`)}</p>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[kind])}`}
          download={`sitli-${kind}-template.csv`}
          className="text-brand hover:underline"
        >
          {t("csv.template")}
        </a>
        <label className="block">
          <span className="mb-1 block font-medium">{t("csv.file")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => pick(e.target.files?.[0])}
            className="block w-full text-sm"
          />
          {fileName ? <span className="text-xs text-zinc-500">{fileName}</span> : null}
        </label>
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <p className="font-medium">
              {result.dryRun ? t("csv.preview") : t("csv.done")} ·{" "}
              {t("csv.result", {
                created: result.created,
                updated: result.updated,
                skipped: result.skipped,
              })}
            </p>
            {result.errors.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("csv.errors")}</p>
                <ul className="mt-1 max-h-48 overflow-auto text-xs text-red-700">
                  {result.errors.map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      {t("csv.line", { line: e.line })}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
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
        </div>
      </div>
    </Dialog>
  );
}
