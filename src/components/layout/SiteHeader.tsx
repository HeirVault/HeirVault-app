"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/beneficiaries", label: "Beneficiaries" },
  { href: "/vault/new", label: "New vault" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="hv-container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" aria-label="HeirVault home">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
            >
              HV
            </span>
            <span className="hidden text-base font-semibold text-content-strong sm:block">HeirVault</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-brand-50 text-brand-800"
                          : "text-content hover:bg-surface-raised hover:text-content-strong",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <NetworkBadge />
          <ConnectWalletButton size="sm" />
        </div>
      </div>

      <nav aria-label="Mobile navigation" className="border-t border-border md:hidden">
        <ul className="hv-container flex items-center gap-1 overflow-x-auto py-2">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                    active ? "bg-brand-50 text-brand-800" : "text-content",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
