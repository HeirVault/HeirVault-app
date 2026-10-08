"use client";

import type { ReactNode } from "react";

import { VaultProvider } from "@/hooks/useVault";
import { WalletProvider } from "@/hooks/useWallet";

/**
 * Client providers.
 *
 * Order matters: {@link VaultProvider} reads wallet state, so it must sit inside
 * {@link WalletProvider}.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <VaultProvider>{children}</VaultProvider>
    </WalletProvider>
  );
}
