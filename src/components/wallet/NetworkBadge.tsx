import { Badge } from "@/components/ui/Badge";
import { getNetworkConfig } from "@/lib/stellar/network";

export function NetworkBadge() {
  const network = getNetworkConfig();
  return (
    <Badge tone={network.isMainnet ? "danger" : "info"} dot title={`RPC: ${network.rpcUrl}`}>
      {network.label}
    </Badge>
  );
}
