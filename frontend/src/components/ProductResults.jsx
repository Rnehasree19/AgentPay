import { useState } from "react";
import ProductCard from "./ProductCard";
import { formatPricePaise } from "../utils/currency";
import { approveApproval, createOrder, createPayment, getApproval, reconcilePayment, rejectApproval, requestApproval, selectOffer, verifyPayment } from "../services/commerce";

function maskValue(value) {
  if (!value) return "empty";
  const text = String(value).trim();
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function safeCommerceError(error, fallback) {
  if (error?.statusCode === 401) return "Authentication is required for this action.";
  if (error?.statusCode === 403) return "You are not allowed to perform this action.";
  if (error?.statusCode >= 500 || error?.code === "NETWORK_ERROR") return "The service is temporarily unavailable. Please try again.";
  return fallback;
}

function ProductResults({ query = {}, results = [], sourceSummary = {} }) {
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [selectionState, setSelectionState] = useState({ status: "idle", decision: null, error: null });
  const [approvalState, setApprovalState] = useState({ status: "idle", approval: null, error: null });
  const [orderState, setOrderState] = useState({ status: "idle", order: null, error: null });
  const [paymentState, setPaymentState] = useState({ status: "idle", payment: null, error: null });
  const [selectedVariant, setSelectedVariant] = useState(null);
  const selectedOffer = results.find((offer) => offer.offerId === selectedOfferId);

  if (results.length === 0) {
    return (
      <section className="product-results empty" aria-label="Product search results">
        <p className="product-empty-title">
          {sourceSummary?.persistenceAvailable === false
            ? "Product results could not be saved safely, so they cannot be selected right now."
            : "No products matched all of your requirements."}
        </p>
        {query.category && <p>Category: {query.category}</p>}
        {query.maxPricePaise !== null && query.maxPricePaise !== undefined && (
          <p>Maximum price: {formatPricePaise(query.maxPricePaise, query.currency)}</p>
        )}
        {(sourceSummary?.partial || sourceSummary?.failedSources?.length > 0) && (
          <p className="product-error">Some product sources were unavailable.</p>
        )}
      </section>
    );
  }

  const hasPartialResults = Boolean(sourceSummary?.partial || sourceSummary?.failedSources?.length);

  async function handleRequestApproval(offerId, variant = selectedVariant) {
    setApprovalState({ status: "pending", approval: null, error: null });

    try {
      const response = await requestApproval(offerId, variant);
      setApprovalState({ status: "complete", approval: response.approval || null, decision: response.decision || null, error: null });
    } catch (error) {
      setApprovalState({ status: "error", approval: null, error });
    }
  }

  async function handleSelect(offerId, variant = null) {
    if (selectionState.status === "pending") return;

    setSelectedOfferId(offerId);
    setSelectedVariant(variant);
    setApprovalState({ status: "idle", approval: null, error: null });
    setOrderState({ status: "idle", order: null, error: null });
    setPaymentState({ status: "idle", payment: null, error: null });
    setSelectionState({ status: "pending", decision: null, error: null });

    try {
      const decision = await selectOffer(offerId, variant);
      setSelectionState({ status: "complete", decision, error: null });
    } catch (error) {
      setSelectionState({ status: "error", decision: null, error });
    }
  }

  async function handleStartPayment(order) {
    setPaymentState({ status: "creating", payment: null, error: null });
    try {
      const response = await createPayment(order.orderId);
      const payment = response.payment;
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout is unavailable in this browser session.");
      }

      setPaymentState({ status: "payment_pending", payment, error: null });
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amountPaise,
        currency: payment.currency,
        name: "AgentPay Test Mode",
        order_id: payment.providerOrderId,
        handler: async (callbackData) => {
          try {
            console.log("[AgentPay][Razorpay success callback]", {
              hasPaymentId: Boolean(callbackData?.razorpay_payment_id),
              hasOrderId: Boolean(callbackData?.razorpay_order_id),
              signatureLength: callbackData?.razorpay_signature?.length ?? 0,
              orderIdMasked: maskValue(callbackData?.razorpay_order_id),
              paymentIdMasked: maskValue(callbackData?.razorpay_payment_id),
            });
            const verified = await verifyPayment(payment.paymentId, callbackData);
            if (verified.payment?.status === "CAPTURED" && verified.orderStatus === "PAID") {
              setOrderState((current) => current.order
                ? { ...current, order: { ...current.order, status: verified.orderStatus } }
                : current);
              setPaymentState({ status: "paid", payment: verified.payment, error: null });
              return;
            }

            await reconcilePaymentAfterVerification(payment.paymentId, verified);
          } catch (error) {
            setPaymentState({ status: "verification_error", payment, error });
          }
        },
      });
      checkout.open();
    } catch (error) {
      setPaymentState({ status: "error", payment: null, error });
    }
  }

  async function reconcilePaymentAfterVerification(paymentId, verified) {
    if (verified.payment?.status === "FAILED" || verified.orderStatus === "FAILED") {
      setPaymentState({ status: "failed", payment: verified.payment, error: null });
      return;
    }

    setPaymentState({ status: "authorized", payment: verified.payment, error: null });
    setPaymentState({ status: "reconciliation_required", payment: verified.payment, error: null });
    setPaymentState({ status: "reconciling", payment: verified.payment, error: null });

    try {
      const reconciled = await reconcilePayment(paymentId);
      const paymentStatus = reconciled.payment?.status;
      const orderStatus = reconciled.orderStatus;
      setOrderState((current) => current.order
        ? { ...current, order: { ...current.order, status: orderStatus } }
        : current);

      if (reconciled.reconciliationStatus === "CONFIRMED" && paymentStatus === "CAPTURED" && orderStatus === "PAID") {
        setPaymentState({ status: "paid", payment: reconciled.payment, error: null });
        return;
      }

      if (reconciled.reconciliationStatus === "FAILED" || paymentStatus === "FAILED" || orderStatus === "FAILED") {
        setPaymentState({ status: "failed", payment: reconciled.payment, error: null });
        return;
      }

      setPaymentState({ status: "unknown", payment: reconciled.payment, error: null });
    } catch (error) {
      setPaymentState({ status: "reconciliation_error", payment: verified.payment, error });
    }
  }

  async function handleReconcile(payment) {
    setPaymentState({ status: "reconciling", payment, error: null });
    try {
      const reconciled = await reconcilePayment(payment.paymentId);
      const paymentStatus = reconciled.payment?.status;
      const orderStatus = reconciled.orderStatus;
      setOrderState((current) => current.order
        ? { ...current, order: { ...current.order, status: orderStatus } }
        : current);

      if (reconciled.reconciliationStatus === "CONFIRMED" && paymentStatus === "CAPTURED" && orderStatus === "PAID") {
        setPaymentState({ status: "paid", payment: reconciled.payment, error: null });
      } else if (reconciled.reconciliationStatus === "FAILED" || paymentStatus === "FAILED" || orderStatus === "FAILED") {
        setPaymentState({ status: "failed", payment: reconciled.payment, error: null });
      } else {
        setPaymentState({ status: "unknown", payment: reconciled.payment, error: null });
      }
    } catch (error) {
      setPaymentState({ status: "reconciliation_error", payment, error });
    }
  }

  async function handleApprove(approvalId) {
    setApprovalState({ status: "approving", approval: approvalState.approval, error: null });
    try {
      const response = await approveApproval(approvalId);
      setApprovalState({ status: "approved", approval: response.approval || approvalState.approval, decision: response.decision || null, error: null });
    } catch (error) {
      try {
        const response = await getApproval(approvalId);
        setApprovalState({ status: "complete", approval: response.approval || approvalState.approval, decision: null, error });
      } catch {
        setApprovalState({ status: "error", approval: approvalState.approval, error });
      }
    }
  }

  async function handleReject(approvalId) {
    setApprovalState({ status: "rejecting", approval: approvalState.approval, error: null });
    try {
      const response = await rejectApproval(approvalId);
      setApprovalState({ status: "rejected", approval: response.approval || approvalState.approval, decision: null, error: null });
    } catch (error) {
      try {
        const response = await getApproval(approvalId);
        setApprovalState({ status: "complete", approval: response.approval || approvalState.approval, decision: null, error });
      } catch {
        setApprovalState({ status: "error", approval: approvalState.approval, error });
      }
    }
  }

  async function handleCreateOrder(offerId, approvalId = null, variant = selectedVariant) {
    setOrderState({ status: "creating", order: null, error: null });
    try {
      const response = await createOrder(offerId, approvalId, variant);
      if (response.order) {
        setOrderState({ status: "complete", order: response.order, decision: null, error: null });
      } else {
        setOrderState({ status: "decision", order: null, decision: response, error: null });
      }
    } catch (error) {
      setOrderState({ status: "error", order: null, error });
    }
  }

  return (
    <section className="product-results" aria-label="Product search results">
      <div className="product-results-grid">
        {results.map((offer) => {
          const offerId = offer?.offerId;

          if (!offerId) {
            return null;
          }

          return (
            <ProductCard
              key={offerId}
              offer={{ ...offer, offerId }}
              selected={selectedOfferId === offerId}
              onSelect={handleSelect}
              selectionState={selectedOfferId === offerId ? selectionState : null}
              approvalState={selectedOfferId === offerId ? approvalState : null}
              onRequestApproval={handleRequestApproval}
              onReject={handleReject}
              orderState={selectedOfferId === offerId ? orderState : null}
              onApprove={handleApprove}
              onCreateOrder={handleCreateOrder}
              paymentState={selectedOfferId === offerId ? paymentState : null}
              onStartPayment={handleStartPayment}
              onReconcile={handleReconcile}
            />
          );
        })}
      </div>

      {hasPartialResults && (
        <p className="product-error" role="status">Some product sources were unavailable. These results may be incomplete.</p>
      )}

      {selectedOffer && (
        <div className="selected-product" aria-live="polite">
          <strong>{selectionState.status === "pending" ? "Checking" : "Selected"}</strong>
          <span>
            {selectedOffer.title || "Product"}
            {formatPricePaise(selectedOffer.pricePaise, selectedOffer.currency)
              ? ` — ${formatPricePaise(selectedOffer.pricePaise, selectedOffer.currency)}`
              : ""}
          </span>
        </div>
      )}

      {selectionState.status === "error" && (
        <p className="commerce-selection-error" role="alert">
          {selectionState.error?.statusCode === 401
            ? "Authentication is required before an offer can be selected."
            : safeCommerceError(selectionState.error, "This offer could not be evaluated safely.")}
        </p>
      )}

      {approvalState.status === "error" && (
        <p className="commerce-selection-error" role="alert">
          {safeCommerceError(approvalState.error, "Approval could not be completed safely.")}
        </p>
      )}

      {orderState.status === "error" && (
        <p className="commerce-selection-error" role="alert">
          {safeCommerceError(orderState.error, "The order could not be created safely.")}
        </p>
      )}
    </section>
  );
}

export default ProductResults;