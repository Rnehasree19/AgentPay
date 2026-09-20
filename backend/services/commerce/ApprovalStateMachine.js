import { ConflictError } from "../../errors/ConflictError.js";

const transitions = {
  PENDING: new Set(["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]),
  APPROVED: new Set(),
  REJECTED: new Set(),
  EXPIRED: new Set(),
  CANCELLED: new Set(),
};

export function assertApprovalTransition(currentStatus, nextStatus) {
  if (!transitions[currentStatus]?.has(nextStatus)) {
    throw new ConflictError(`Approval cannot transition from ${currentStatus} to ${nextStatus}.`);
  }
}

export default assertApprovalTransition;