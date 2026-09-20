export const COMMERCE_DECISIONS = Object.freeze({
  ALLOWED: "ALLOWED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  BLOCKED: "BLOCKED",
});

export const COMMERCE_REASON_CODES = Object.freeze({
  OFFER_NOT_FOUND: "OFFER_NOT_FOUND",
  OFFER_INACTIVE: "OFFER_INACTIVE",
  OFFER_UNAVAILABLE: "OFFER_UNAVAILABLE",
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  POLICY_INACTIVE: "POLICY_INACTIVE",
  POLICY_INVALID: "POLICY_INVALID",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  MAX_TRANSACTION_EXCEEDED: "MAX_TRANSACTION_EXCEEDED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  WITHIN_POLICY: "WITHIN_POLICY",
});

const messages = {
  WITHIN_POLICY: "This purchase is within your current policy.",
  APPROVAL_REQUIRED: "This purchase requires user approval before an order can be created.",
  MAX_TRANSACTION_EXCEEDED: "This purchase exceeds the maximum transaction amount allowed by your policy.",
  CURRENCY_MISMATCH: "This offer currency does not match your current policy.",
  OFFER_NOT_FOUND: "This product offer is no longer available.",
  OFFER_INACTIVE: "This product offer is no longer active.",
  OFFER_UNAVAILABLE: "This product offer is currently unavailable.",
  POLICY_NOT_FOUND: "No active purchase policy was found for your account.",
  POLICY_INACTIVE: "Your purchase policy is inactive.",
  POLICY_INVALID: "Your purchase policy could not be safely evaluated.",
};

export function decisionMessage(reasonCode) {
  return messages[reasonCode] || "This commerce decision could not be completed safely.";
}

export default {
  COMMERCE_DECISIONS,
  COMMERCE_REASON_CODES,
  decisionMessage,
};