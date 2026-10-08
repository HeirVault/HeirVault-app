"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console; no telemetry is sent anywhere.
    console.error("HeirVault route error:", error);
  }, [error]);

  return (
    <div className="hv-container max-w-2xl space-y-6 py-20">
      <Alert tone="danger" title="Something went wrong">
        <p>
          This page could not be rendered. No transaction was submitted as a result of this error.
        </p>
        <p className="mt-2 font-mono text-xs">{error.message}</p>
        {error.digest && <p className="mt-1 font-mono text-xs">digest: {error.digest}</p>}
      </Alert>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign("/")}>
          Back home
        </Button>
      </div>
    </div>
  );
}
