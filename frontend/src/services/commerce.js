const API_URL = "/api/commerce/select";
const APPROVAL_API_URL = "/api/commerce/approval-requests";
const ORDERS_API_URL = "/api/commerce/orders";
const PAYMENT_API_URL = "/api/commerce/orders";

function maskValue(value) {
  if (!value) return "empty";
  const text = String(value).trim();
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

export async function selectOffer(offerId, variant = null) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      offerId,
      ...(variant ? { variant } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || "Unable to evaluate this offer."
    );
    error.code =
      payload?.error?.code || "COMMERCE_SELECTION_FAILED";
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function requestApproval(offerId, variant = null) {
  const response = await fetch(APPROVAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      offerId,
      ...(variant ? { variant } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || "Unable to request approval."
    );
    error.statusCode = response.status;
    error.code =
      payload?.error?.code || "APPROVAL_REQUEST_FAILED";
    throw error;
  }

  return payload;
}

export async function approveApproval(approvalId) {
  const response = await fetch(
    `${APPROVAL_API_URL}/${approvalId}/approve`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Unable to approve this request."
    );
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function getApproval(approvalId) {
  const response = await fetch(
    `${APPROVAL_API_URL}/${approvalId}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      "Unable to refresh approval status."
    );
    error.statusCode = response.status;
    error.code =
      payload?.error?.code || "APPROVAL_STATUS_FAILED";
    throw error;
  }

  return payload;
}

export async function rejectApproval(approvalId) {
  const response = await fetch(
    `${APPROVAL_API_URL}/${approvalId}/reject`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Unable to reject this request."
    );
    error.statusCode = response.status;
    error.code =
      payload?.error?.code || "APPROVAL_REJECTION_FAILED";
    throw error;
  }

  return payload;
}

export async function createOrder(
  offerId,
  approvalId = null,
  variant = null,
  idempotencyKey = crypto.randomUUID()
) {
  const response = await fetch(ORDERS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    credentials: "include",
    body: JSON.stringify({
      offerId,
      ...(approvalId ? { approvalId } : {}),
      ...(variant ? { variant } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Unable to create this order."
    );
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function createPayment(orderId) {
  const response = await fetch(
    `${PAYMENT_API_URL}/${orderId}/payment`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Payment setup is unavailable."
    );
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function verifyPayment(paymentId, paymentData) {
  console.log("[AgentPay][Frontend verify request]", {
    hasPaymentId: Boolean(
      paymentData?.razorpay_payment_id
    ),
    hasOrderId: Boolean(
      paymentData?.razorpay_order_id
    ),
    signatureLength:
      paymentData?.razorpay_signature?.length ?? 0,
    orderIdMasked: maskValue(
      paymentData?.razorpay_order_id
    ),
    paymentIdMasked: maskValue(
      paymentData?.razorpay_payment_id
    ),
  });

  const response = await fetch(
    `/api/commerce/payments/${paymentId}/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        razorpayPaymentId:
          paymentData.razorpay_payment_id,
        razorpayOrderId:
          paymentData.razorpay_order_id,
        razorpaySignature:
          paymentData.razorpay_signature,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Payment verification failed."
    );
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function reconcilePayment(paymentId) {
  const response = await fetch(
    `/api/commerce/payments/${paymentId}/reconcile`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        "Payment reconciliation failed."
    );
    error.statusCode = response.status;
    error.code =
      payload?.error?.code ||
      "PAYMENT_RECONCILIATION_FAILED";
    throw error;
  }

  return payload;
}