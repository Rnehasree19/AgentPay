import { ConflictError } from "../../errors/ConflictError.js";

const transitions = {
  CREATED: new Set(["AUTHORIZED", "CAPTURED", "FAILED", "UNKNOWN"]),
  AUTHORIZED: new Set(["CAPTURED", "FAILED", "UNKNOWN"]),
  CAPTURED: new Set(["REFUNDED"]),
  FAILED: new Set(),
  REFUNDED: new Set(),
  UNKNOWN: new Set(["AUTHORIZED", "CAPTURED", "FAILED"]),
};

export function assertPaymentTransition(currentStatus, nextStatus) {
  if (!transitions[currentStatus]?.has(nextStatus)) {
    throw new ConflictError(`Payment cannot transition from ${currentStatus} to ${nextStatus}.`);
  }
}

export default assertPaymentTransition;