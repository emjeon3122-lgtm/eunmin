"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { ApprovalRuleCheckResult, OccasionType } from "@/lib/types";

/**
 * Debounced (500ms) live check against GET /api/approval-rules/check, per
 * doc 03 §3-1. This is a UX convenience only — the server always re-validates
 * at submit time (doc 02 §3-1/§3-2), so this hook's result is never trusted
 * as the final gate.
 */
export function useApprovalRuleCheck(occasionType: OccasionType | "" | undefined, declaredAmount: number | undefined) {
  const [requiresPreApproval, setRequiresPreApproval] = useState(false);
  const [matchedRule, setMatchedRule] = useState<ApprovalRuleCheckResult["matchedRule"]>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!occasionType || !declaredAmount || declaredAmount <= 0) {
      setRequiresPreApproval(false);
      setMatchedRule(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiGet<{ data: ApprovalRuleCheckResult }>(
          `/approval-rules/check?occasionType=${encodeURIComponent(occasionType)}&declaredAmount=${declaredAmount}`
        );
        setRequiresPreApproval(res.data.requiresPreApproval);
        setMatchedRule(res.data.matchedRule ?? null);
      } catch (err) {
        // Fail open on the UX check — the server still enforces this at submit time.
        if (!(err instanceof ApiError)) throw err;
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [occasionType, declaredAmount]);

  return { requiresPreApproval, matchedRule, loading };
}
