import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportView } from "@/components/report/ReportView";
import { getAudit } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Spec §11 print view: the same report with no polling and no navigation, so
 * the browser's "Save as PDF" produces a clean document (spec §13, phase 11
 * adds a true PDF render on top of this page).
 */
export default async function PrintAuditPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getAudit(params.id).catch(() => null);

  // The PDF is rendered while the audit row is still `running` (the report is
  // persisted one step earlier), so the print view must key off the report
  // payload rather than the status flag (spec §13, phase 11).
  if (data === null || data.result === null) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 no-print">
        <Link
          href={`/audit/${data.id}`}
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          ← Back to report
        </Link>
      </div>
      <ReportView
        auditId={data.id}
        report={data.result}
        uiux={data.uiux}
        page={data.page}
        pdfUrl={data.pdfUrl}
      />
    </main>
  );
}
