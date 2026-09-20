import { useState } from "react";
import { formatPricePaise } from "../utils/currency";
import { getSafeExternalUrl } from "../utils/safeUrl";
import ProductImage from "./ProductImage";

const availabilityLabels = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  limited: "Limited availability",
  unknown: "Availability unknown",
};

function safeCommerceError(error, fallback) {
  if (error?.statusCode === 401) return "Authentication is required for this action.";
  if (error?.statusCode === 403) return "You are not allowed to perform this action.";
  if (error?.statusCode >= 500 || error?.code === "NETWORK_ERROR") return "The service is temporarily unavailable. Please try again.";
  return fallback;
}

function ProductCard({ offer, selected, onSelect, selectionState, approvalState, onRequestApproval, onApprove, onReject, orderState, onCreateOrder, paymentState, onStartPayment, onReconcile }) {
  const [size, setSize] = useState(offer?.attributes?.sizes?.[0] || "");
  const [color, setColor] = useState(offer?.attributes?.colors?.[0] || "");
  const safeUrl = getSafeExternalUrl(offer?.url);
  const title = offer?.title || "Untitled product";
  const price = formatPricePaise(offer?.pricePaise, offer?.currency);
  const reasons = Array.isArray(offer?.rankingReasons)
    ? offer.rankingReasons.filter((reason) => typeof reason === "string" && reason.trim())
    : [];
  const approvalStatus = approvalState?.approval?.status || null;
  const approvalPending = approvalStatus === "PENDING";
  const approvalApproved = approvalStatus === "APPROVED";
  const canCreateOrder = approvalApproved && !["creating", "complete"].includes(orderState?.status);
  const canStartPayment = orderState?.order && ["APPROVED", "PAYMENT_PENDING"].includes(orderState.order.status);
  const paymentStarted = Boolean(paymentState?.payment) || ["creating", "payment_pending", "authorized", "reconciliation_required", "reconciling", "verification_error", "reconciliation_error", "unknown", "failed", "paid"].includes(paymentState?.status);
  const sizes = Array.isArray(offer?.attributes?.sizes) ? offer.attributes.sizes : [];
  const colors = Array.isArray(offer?.attributes?.colors) ? offer.attributes.colors : [];
  const variant = { ...(size ? { size } : {}), ...(color ? { color } : {}) };
  const variantRequired = sizes.length > 0 && !size;

  return (
    <article className={`product-card${selected ? " selected" : ""}`}>
      <ProductImage imageUrl={offer?.imageUrl} title={title} />
      <div className="product-card-header">
        <div>
          <h3>{title}</h3>
          {offer?.brand && <p className="product-brand">{offer.brand}</p>}
        </div>
        {selected && <span className="selected-badge">Selected</span>}
      </div>

      {price && <p className="product-price">{price}</p>}

      {(sizes.length > 0 || colors.length > 0) && (
        <div className="product-variants">
          {sizes.length > 0 && (
            <label>
              Size
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="">Choose size</option>
                {sizes.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
          {colors.length > 0 && (
            <label>
              Color
              <select value={color} onChange={(event) => setColor(event.target.value)}>
                <option value="">Choose color</option>
                {colors.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="product-facts">
        <span className={`availability availability-${offer?.availability || "unknown"}`}>
          {availabilityLabels[offer?.availability] || "Availability unknown"}
        </span>
        <span>
          Source: {offer?.sourceType === "demo"
            ? `${offer?.sourceName || offer?.source || "Demo"} (Demo catalog)`
            : offer?.sourceName || offer?.source || "Source unavailable"}
        </span>
      </div>

      {offer?.score !== undefined && offer?.score !== null && (
        <p className="product-score">Match score: {offer.score}</p>
      )}

      {reasons.length > 0 && (
        <div className="product-reasons">
          <strong>Why this matched</strong>
          <ul>
            {reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="product-card-actions">
        <button
          type="button"
          className={`select-product-button${selected ? " selected" : ""}`}
          onClick={() => onSelect(offer?.offerId, variant)}
          aria-pressed={selected}
          disabled={selectionState?.status === "pending" || variantRequired}
        >
          {selectionState?.status === "pending" ? "Checking..." : selected ? "Selected" : "Select"}
        </button>
        {safeUrl && (
          <a
            className="view-product-link"
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View product
          </a>
        )}
      </div>

      {selectionState?.status === "complete" && selectionState.decision && (
        <div className={`commerce-decision commerce-${selectionState.decision.decision.toLowerCase()}`} role="status">
          <strong>{selectionState.decision.decision}</strong>
          <span>{selectionState.decision.message}</span>
        </div>
      )}

      {(selectionState?.decision?.decision === "APPROVAL_REQUIRED" || approvalState?.approval) && (
        <div className="approval-actions">
          {approvalState?.approval && <span>Approval status: {approvalStatus || "UNKNOWN"}</span>}
          {!approvalState?.approval && (
            <button
              type="button"
              className="request-approval-button"
              onClick={() => onRequestApproval(offer?.offerId, variant)}
              disabled={approvalState?.status === "pending"}
            >
              {approvalState?.status === "pending" ? "Requesting..." : "Request Approval"}
            </button>
          )}
          {approvalState?.approval && (
            <span>{approvalStatus === "PENDING" ? "Approval is awaiting a decision." : approvalStatus === "APPROVED" ? "Approval recorded." : `Approval is ${approvalStatus.toLowerCase()}.`}</span>
          )}
          {approvalPending && (
            <button type="button" className="approve-request-button" onClick={() => onApprove(approvalState.approval.approvalId)} disabled={approvalState.status === "approving" || approvalState.status === "rejecting"}>
              {approvalState.status === "approving" ? "Approving..." : "Approve request"}
            </button>
          )}
          {approvalPending && (
            <button type="button" className="request-approval-button" onClick={() => onReject(approvalState.approval.approvalId)} disabled={approvalState.status === "approving" || approvalState.status === "rejecting"}>
              {approvalState.status === "rejecting" ? "Rejecting..." : "Reject request"}
            </button>
          )}
          {approvalState.status === "complete" && !approvalState.approval && (
            <span>Approval was not created because the backend decision changed.</span>
          )}
          {canCreateOrder && (
              <button type="button" className="create-order-button" onClick={() => onCreateOrder(offer?.offerId, approvalState.approval.approvalId, variant)} disabled={orderState?.status === "creating" || orderState?.status === "complete" || variantRequired}>
              {orderState?.status === "complete" ? "Order created" : orderState?.status === "creating" ? "Creating..." : "Create Order"}
            </button>
          )}
        </div>
      )}

      {selectionState?.decision?.decision === "ALLOWED" && (
        <button type="button" className="create-order-button" onClick={() => onCreateOrder(offer?.offerId, null, variant)} disabled={orderState?.status === "creating" || orderState?.status === "complete" || variantRequired}>
          {orderState?.status === "complete" ? `Order ${orderState.order?.status || "created"}` : orderState?.status === "creating" ? "Creating..." : "Create Order"}
        </button>
      )}

      {orderState?.status === "decision" && orderState.decision && (
        <div className="commerce-decision commerce-blocked" role="status">
          <strong>{orderState.decision.decision || "Order not created"}</strong>
          <span>{orderState.decision.message || "The backend did not authorize order creation."}</span>
        </div>
      )}

      {orderState?.status === "complete" && orderState.order && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Order status: {orderState.order.status}</strong>
          <span>{orderState.order.status === "APPROVED" ? "Order approved. Payment has not been initiated." : "The backend remains authoritative for this order state."}</span>
        </div>
      )}

      {orderState?.status === "complete" && canStartPayment && (
        <button type="button" className="payment-button" onClick={() => onStartPayment(orderState.order)} disabled={paymentStarted}>
          {paymentState?.status === "creating" ? "Preparing payment..." : paymentState?.status === "payment_pending" ? "Checkout opened" : paymentState?.status === "authorized" ? "Payment authorized" : "Pay with Razorpay Test Mode"}
        </button>
      )}

      {paymentState?.status === "authorized" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Payment authorized</strong>
          <span>The payment is not PAID until the backend confirms reconciliation.</span>
        </div>
      )}

      {paymentState?.status === "reconciliation_required" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Reconciliation required</strong>
          <span>The backend must confirm the final payment and order state.</span>
        </div>
      )}

      {paymentState?.status === "reconciling" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Confirming payment status</strong>
          <span>Payment was verified and the final order state is being confirmed.</span>
        </div>
      )}

      {paymentState?.status === "payment_pending" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Payment pending</strong>
          <span>Checkout is open. The backend has not confirmed payment yet.</span>
        </div>
      )}

      {paymentState?.status === "paid" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Payment confirmed</strong>
          <span>Order status: PAID</span>
        </div>
      )}

      {paymentState?.status === "failed" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Payment failed</strong>
          <span>The order was not marked PAID. No new order was created.</span>
        </div>
      )}

      {paymentState?.status === "unknown" && (
        <div className="commerce-decision commerce-order-status" role="status">
          <strong>Payment status is being confirmed</strong>
          <span>The backend has not confirmed a final payment state yet.</span>
          <button type="button" className="payment-button" onClick={() => onReconcile(paymentState.payment)} disabled={paymentState.status === "reconciling"}>
            Check payment status again
          </button>
        </div>
      )}

      {(paymentState?.status === "error" || paymentState?.status === "verification_error" || paymentState?.status === "reconciliation_error") && (
        <p className="commerce-selection-error" role="alert">
          {paymentState.status === "reconciliation_error"
            ? "Payment verification completed, but the final payment state could not be confirmed."
            : safeCommerceError(paymentState.error, "Payment could not be completed safely.")}
        </p>
      )}

      {paymentState?.status === "reconciliation_error" && paymentState.payment && (
        <button type="button" className="payment-button" onClick={() => onReconcile(paymentState.payment)}>
          Retry payment confirmation
        </button>
      )}
    </article>
  );
}

export default ProductCard;