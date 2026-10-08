import { Badge } from "@/components/ui/Badge";
import { CLAIM_STATUS_META, type ClaimStatus } from "@/lib/vault/types";

export function ClaimStatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  const meta = CLAIM_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot title={meta.description} className={className}>
      {meta.label}
    </Badge>
  );
}
