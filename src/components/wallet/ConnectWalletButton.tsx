"use client";

import { useState } from "react";

import { WalletIndicator } from "@/components/wallet/WalletIndicator";
import { WalletModal } from "@/components/wallet/WalletModal";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";

export interface ConnectWalletButtonProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ConnectWalletButton({ size = "md", className }: ConnectWalletButtonProps) {
  const { status, connect, availableWallets } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  if (status === "connected") {
    return <WalletIndicator className={className} />;
  }

  const anyAvailable = availableWallets.some((entry) => entry.available);
  const loading = status === "detecting" || status === "connecting";

  return (
    <>
      <Button
        size={size}
        className={className}
        loading={loading}
        loadingLabel="Connecting…"
        onClick={() => (anyAvailable ? setModalOpen(true) : void connect())}
      >
        {status === "unavailable" ? "Install a wallet" : "Connect wallet"}
      </Button>
      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
