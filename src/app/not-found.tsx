import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="hv-container py-20">
      <EmptyState
        title="Page not found"
        description="The page you were looking for does not exist. It may have been moved, or the vault identifier may be incorrect."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Back home
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-content-strong transition hover:border-brand-300"
            >
              Go to dashboard
            </Link>
          </div>
        }
      />
    </div>
  );
}
