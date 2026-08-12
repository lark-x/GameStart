import { V2DomainError } from "./errors.ts";

export type V2ReviewStatus = "pending" | "approved" | "rejected" | "changes_requested";
export type V2ReviewAction = "approve" | "reject" | "request_changes";

const transitions: Record<V2ReviewStatus, readonly V2ReviewStatus[]> = {
  pending: ["approved", "rejected", "changes_requested"],
  approved: [],
  rejected: [],
  changes_requested: ["approved", "rejected"],
};

export function nextV2ReviewStatus(action: V2ReviewAction): V2ReviewStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return "changes_requested";
}

export function assertV2ReviewTransition(from: V2ReviewStatus, action: V2ReviewAction): V2ReviewStatus {
  const to = nextV2ReviewStatus(action);
  if (!transitions[from].includes(to)) {
    throw new V2DomainError("INVALID_CANDIDATE_TRANSITION", `Cannot ${action} a ${from} candidate`);
  }
  return to;
}
