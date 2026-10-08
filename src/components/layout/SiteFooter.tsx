import Link from "next/link";

import { getContractConfig } from "@/lib/stellar/contract";

export function SiteFooter() {
  const config = getContractConfig();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="hv-container flex flex-col gap-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-content-strong">HeirVault</p>
          <p className="mt-1 max-w-xl">
            Programmable digital inheritance on Stellar. Assets are released to named beneficiaries only when
            the activation conditions you configure are satisfied.
          </p>
        </div>
        <div className="space-y-1 text-xs">
          <p>
            Network: <span className="text-content-strong">{config.network.label}</span>
          </p>
          <p>
            Contract:{" "}
            <span className="font-mono text-content-strong">
              {config.contractId ?? "not configured"}
            </span>
          </p>
          <p>
            <Link className="hv-link" href="/verify">
              Public verification
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
