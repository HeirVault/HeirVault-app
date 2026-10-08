import Link from "next/link";

import { StatusBanners } from "@/components/layout/StatusBanners";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";
import { Card, CardBody } from "@/components/ui/Card";

const FEATURES = [
  {
    title: "Self-custodial vaults",
    body: "Your assets stay in a Soroban contract that you alone control. HeirVault never holds keys or funds.",
  },
  {
    title: "Liveness check-ins",
    body: "A scheduled check-in keeps the vault dormant. Miss it, and a grace period starts before anything moves.",
  },
  {
    title: "Exact beneficiary shares",
    body: "Allocations are stored in basis points and must total exactly 100% — enforced in the UI and in the contract.",
  },
  {
    title: "Guardian thresholds",
    body: "Optionally require a set of trusted Stellar accounts to approve activation before heirs can claim.",
  },
  {
    title: "Transparent verification",
    body: "Anyone can inspect a vault's public data and its Stellar transaction history without connecting a wallet.",
  },
  {
    title: "Honest by design",
    body: "The interface never reports a transaction as confirmed unless the network said so. No simulated success.",
  },
];

const STEPS = [
  { step: "01", title: "Connect", body: "Link a Stellar wallet. Your address becomes the vault owner." },
  { step: "02", title: "Configure", body: "Pick the asset, name your beneficiaries and their exact shares." },
  { step: "03", title: "Protect", body: "Set check-in intervals, grace periods and optional guardians." },
  { step: "04", title: "Release", body: "When your conditions are met, beneficiaries claim their share." },
];

export default function HomePage() {
  return (
    <div className="hv-container space-y-16 py-12 sm:py-16">
      <section className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <NetworkBadge />
            <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
              Built on Soroban
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-content-strong sm:text-5xl">
            Programmable inheritance for your digital assets.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-content">
            HeirVault is an on-chain will. Lock supported assets, name your beneficiaries with exact shares,
            and release them automatically when the conditions you set are satisfied — without a custodian in
            the middle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/vault/new"
              className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Create an inheritance vault
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-5 text-sm font-medium text-content-strong transition hover:border-brand-300 hover:text-brand-700"
            >
              View your dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            Read-only verification is public. Creating and managing vaults requires a Stellar wallet.
          </p>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">How it works</h2>
            <ol className="space-y-4">
              {STEPS.map((item) => (
                <li key={item.step} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700"
                  >
                    {item.step}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-content-strong">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="features-heading" className="space-y-6">
        <div>
          <h2 id="features-heading" className="text-2xl font-semibold text-content-strong">
            Designed for real inheritance, not a demo
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Every feature maps to a contract entrypoint. Where the contract is not yet deployed, the interface
            says so instead of pretending.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <Card className="h-full">
                <CardBody>
                  <h3 className="text-sm font-semibold text-content-strong">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted">{feature.body}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-content-strong">Environment status</h2>
        <StatusBanners className="space-y-3" />
      </section>
    </div>
  );
}
