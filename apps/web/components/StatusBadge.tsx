import { STATUS_BADGE } from "@/lib/labels";
import type { WreathStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: WreathStatus }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.submitted;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
      ● {badge.label}
    </span>
  );
}
