import {
  COMMERCE_DECISIONS,
  COMMERCE_REASON_CODES,
  decisionMessage,
} from "./CommerceDecision.js";

function result(decision, reasonCode, offer = null) {
  return {
    decision,
    reasonCode,
    message: decisionMessage(reasonCode),
    ...(offer ? { offer } : {}),
  };
}

export class PolicyEngine {
  decide(offer, policy) {
    if (!offer) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.OFFER_NOT_FOUND);
    }

    if (offer.active !== true) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.OFFER_INACTIVE, offer);
    }

    if (!["in_stock", "limited"].includes(offer.availability)) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.OFFER_UNAVAILABLE, offer);
    }

    if (!policy) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.POLICY_NOT_FOUND, offer);
    }

    if (policy.active !== true) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.POLICY_INACTIVE, offer);
    }

    if (
      !Number.isInteger(offer.pricePaise) ||
      offer.pricePaise < 0 ||
      !Number.isInteger(policy.maxTransactionAmountPaise) ||
      policy.maxTransactionAmountPaise < 0 ||
      !Number.isInteger(policy.approvalRequiredAbovePaise) ||
      policy.approvalRequiredAbovePaise < 0
    ) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.POLICY_INVALID, offer);
    }

    if (String(offer.currency).toUpperCase() !== String(policy.currency).toUpperCase()) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.CURRENCY_MISMATCH, offer);
    }

    if (offer.pricePaise > policy.maxTransactionAmountPaise) {
      return result(COMMERCE_DECISIONS.BLOCKED, COMMERCE_REASON_CODES.MAX_TRANSACTION_EXCEEDED, offer);
    }

    if (offer.pricePaise > policy.approvalRequiredAbovePaise) {
      return result(COMMERCE_DECISIONS.APPROVAL_REQUIRED, COMMERCE_REASON_CODES.APPROVAL_REQUIRED, offer);
    }

    return result(COMMERCE_DECISIONS.ALLOWED, COMMERCE_REASON_CODES.WITHIN_POLICY, offer);
  }
}

export default PolicyEngine;