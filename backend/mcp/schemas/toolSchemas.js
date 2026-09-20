import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a valid identifier");
const quantity = z.number().int().min(1).max(1);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/);

export const toolSchemas = Object.freeze({
  search_products: {
    query: z.string().trim().max(200).optional(),
    originalQuery: z.string().trim().max(2000).optional(),
    minPricePaise: z.number().int().min(0).optional(),
    maxPricePaise: z.number().int().min(0).optional(),
    minRating: z.number().min(0).max(5).optional(),
    category: z.string().trim().max(80).optional(),
    requiredAttributes: z.record(z.string(), z.string().trim().max(100)).optional(),
  },
  select_offer: { offerId: objectId, quantity },
  check_policy: { offerId: objectId },
  request_approval: { offerId: objectId },
  create_order: { offerId: objectId, approvalId: objectId.nullish(), idempotencyKey },
  create_payment: { orderId: objectId },
  verify_payment: {
    paymentId: objectId,
    razorpayPaymentId: z.string().trim().min(1).max(200),
    razorpayOrderId: z.string().trim().min(1).max(200),
    razorpaySignature: z.string().trim().min(1).max(500),
  },
  reconcile_payment: { paymentId: objectId },
});

export const TOOL_CATEGORIES = Object.freeze({
  READ_ONLY: ["search_products", "check_policy"],
  STATE_CHANGING: ["select_offer", "request_approval", "create_order", "create_payment", "verify_payment", "reconcile_payment"],
});
