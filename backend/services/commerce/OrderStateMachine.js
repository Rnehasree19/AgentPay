import { ConflictError } from "../../errors/ConflictError.js";
import { ORDER_STATUSES } from "./OrderStatus.js";

const transitions = {
  [ORDER_STATUSES.PENDING_APPROVAL]: new Set([ORDER_STATUSES.APPROVED, ORDER_STATUSES.CANCELLED]),
  [ORDER_STATUSES.APPROVED]: new Set([ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.CANCELLED]),
  [ORDER_STATUSES.PAYMENT_PENDING]: new Set([ORDER_STATUSES.PAID, ORDER_STATUSES.FAILED, ORDER_STATUSES.UNKNOWN, ORDER_STATUSES.CANCELLED]),
  [ORDER_STATUSES.UNKNOWN]: new Set([ORDER_STATUSES.PAYMENT_PENDING, ORDER_STATUSES.PAID, ORDER_STATUSES.FAILED]),
  [ORDER_STATUSES.PAID]: new Set(),
  [ORDER_STATUSES.FAILED]: new Set(),
  [ORDER_STATUSES.CANCELLED]: new Set(),
};

export function assertOrderTransition(currentStatus, nextStatus) {
  if (!transitions[currentStatus]?.has(nextStatus)) {
    throw new ConflictError(`Order cannot transition from ${currentStatus} to ${nextStatus}.`);
  }
}

export default assertOrderTransition;