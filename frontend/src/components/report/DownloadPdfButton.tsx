"use client";

import { Download, Loader2 } from "lucide-react";
import * as React from "react";

import { createAuditPdf } from "@/lib/api";

type DownloadPdfButtonProps = {
  auditId: string;
  pdfUrl: string | null;
};

/**
 * Report PDF download. When the pipeline already rendered it the button is a
 * plain link; otherwise the first click renders it server-side and opens the
 * result, so old or partially failed audits still get a PDF.
 */
export function DownloadPdfButton({ auditId, pdfUrl }: DownloadPdfButtonProps) {
  const [url, setUrl] = React.useState(pdfUrl);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    try {
      const { pdfUrl: generated } = await createAuditPdf(auditId);
      setUrl(generated);
      window.open(generated, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not build the PDF. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow transition-colors";

  return (
    <div className="flex flex-col items-end gap-1">
      {url === null ? (
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={pending}
          className={`${base} hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {pending ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Download aria-hidden className="h-4 w-4" />
          )}
          {pending ? "Building PDF…" : "Download PDF"}
        </button>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className={`${base} hover:bg-primary/90`}>
          <Download aria-hidden className="h-4 w-4" />
          Download PDF
        </a>
      )}

      {error === null ? null : (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
