import { Badge } from "@/components/ui/Badge";
import { VAULT_STATUS_META, type VaultStatus } from "@/lib/vault/types";

export interface VaultStatusBadgeProps {
  status: VaultStatus;
  className?: string;
}

export function VaultStatusBadge({ status, className }: VaultStatusBadgeProps) {
  const meta = VAULT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot title={meta.description} className={className}>
      {meta.label}
    </Badge>
  );
}
