import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <FileQuestion
          aria-hidden
          className="mx-auto h-8 w-8 text-muted-foreground"
        />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          That report is not here
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The audit may have been deleted, its link mistyped, or the run may not
          have finished. Reports only open once an audit is completed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Run a new audit
        </Link>
      </div>
    </main>
  );
}
