import { AuditService } from "../../services/audit/AuditService.js";
import { z } from "zod";
import { AUDIT_EVENT_TYPES } from "../../services/audit/AuditEventTypes.js";
import { ApprovalService } from "../../services/commerce/ApprovalService.js";
import { OfferSelectionService } from "../../services/commerce/OfferSelectionService.js";
import { OrderService } from "../../services/commerce/OrderService.js";
import { PaymentService } from "../../services/payment/PaymentService.js";
import { createProductSearchOrchestrator } from "../../services/productSearch/searchRuntime.js";
import { ProductSearchQuery } from "../../services/productSearch/ProductSearchQuery.js";
import { requireAuthenticatedContext } from "../errors/McpToolError.js";
import { toolSchemas } from "../schemas/toolSchemas.js";

const STATE_CHANGING_TOOLS = new Set(["select_offer", "request_approval", "create_order", "create_payment", "verify_payment", "reconcile_payment"]);

function safeError(error) {
  return {
    code: error?.code || (error?.statusCode === 401 ? "AUTHENTICATION_ERROR" : "MCP_TOOL_ERROR"),
    message: error?.isOperational || error?.statusCode < 500 ? error.message : "The MCP tool could not complete safely.",
  };
}

function safeSearchResult(result) {
  const results = (result?.results || []).flatMap((item) => (item.offers?.length ? item.offers : [item.product]).filter(Boolean).map((offer) => {
    const persistedId = offer?._id ? String(offer._id) : null;
    return {
      _id: persistedId,
      offerId: persistedId,
      productId: item.product?.productKey || null,
      title: offer.title || item.product?.title || "",
      brand: offer.brand || item.product?.brand || "",
      category: offer.category || item.product?.category || "",
      description: offer.description || item.product?.description || "",
      pricePaise: offer.pricePaise ?? item.product?.pricePaise ?? null,
      currency: offer.currency || item.product?.currency || null,
      source: offer.sourceCode || item.product?.sourceCode || null,
      sourceName: offer.sourceName || item.product?.sourceName || null,
      sourceType: offer.sourceType || item.product?.sourceType || "other",
      rating: offer.rating ?? item.product?.rating ?? null,
      reviewCount: offer.reviewCount ?? item.product?.reviewCount ?? null,
      availability: offer.availability || item.product?.availability || null,
      url: offer.url || "",
      imageUrl: offer.imageUrl || "",
      attributes: offer.attributes || item.product?.attributes || {},
      fetchedAt: offer.fetchedAt || null,
      rank: item.rank ?? null,
      score: item.score ?? null,
      rankingReasons: item.rankingReasons || [],
    };
  }));

  return {
    query: result?.query || {},
    results,
    count: results.length,
    partial: Boolean(result?.partial),
    successfulSources: result?.successfulSources || [],
    failedSources: (result?.failedSources || []).map(({ sourceCode, sourceName, errorCode }) => ({ sourceCode, sourceName: sourceName || null, errorCode })),
    fetchedAt: result?.fetchedAt || null,
    persistenceAvailable: result?.persistenceAvailable ?? null,
  };
}

export class AgentPayToolRegistry {
  constructor({
    searchOrchestrator = createProductSearchOrchestrator(),
    selectionService = new OfferSelectionService(),
    approvalService = new ApprovalService(),
    orderService = new OrderService(),
    paymentService = new PaymentService(),
    auditService = new AuditService(),
  } = {}) {
    this.services = { searchOrchestrator, selectionService, approvalService, orderService, paymentService, auditService };
  }

  listTools() {
    return Object.keys(toolSchemas);
  }

  async invoke(name, input = {}, context = {}) {
    if (!toolSchemas[name]) {
      return { ok: false, error: { code: "MCP_TOOL_NOT_FOUND", message: "The requested MCP tool is not registered." } };
    }

    let parsed;
    try {
      parsed = z.object(toolSchemas[name]).parse(input);
      if (STATE_CHANGING_TOOLS.has(name)) requireAuthenticatedContext(context);
      const data = await this.execute(name, parsed, context);
      await this.audit(name, context, data, true);
      return { ok: true, data };
    } catch (error) {
      await this.audit(name, context, null, false, error);
      return { ok: false, error: safeError(error) };
    }
  }

  async execute(name, input, context) {
    const userId = context.authenticatedUserId;
    switch (name) {
      case "search_products": {
        const query = new ProductSearchQuery({
          queryText: input.query || "",
          category: input.category || "",
          minPricePaise: input.minPricePaise,
          maxPricePaise: input.maxPricePaise,
          ratingMin: input.minRating,
          attributes: input.requiredAttributes || {},
        });
        return safeSearchResult(await this.services.searchOrchestrator.search(query, {
          userId: userId || null,
          originalQuery: input.originalQuery || input.query || "",
        }));
      }
      case "select_offer":
        return { decision: await this.services.selectionService.select({ offerId: input.offerId, authenticatedUserId: userId }), quantity: input.quantity };
      case "check_policy":
        return this.services.selectionService.select({ offerId: input.offerId, authenticatedUserId: requireAuthenticatedContext(context) });
      case "request_approval":
        return this.services.approvalService.requestApproval({ offerId: input.offerId, authenticatedUserId: userId });
      case "create_order":
        return this.services.orderService.createOrder({ offerId: input.offerId, approvalId: input.approvalId || null, authenticatedUserId: userId, idempotencyKey: input.idempotencyKey });
      case "create_payment":
        return this.services.paymentService.createPaymentForOrder({ orderId: input.orderId, authenticatedUserId: userId });
      case "verify_payment":
        return this.services.paymentService.verifyPayment({ ...input, authenticatedUserId: userId });
      case "reconcile_payment":
        return this.services.paymentService.reconcilePayment({ paymentId: input.paymentId, authenticatedUserId: userId });
      default:
        throw new Error("Unsupported MCP tool.");
    }
  }

  async audit(name, context, data, success, error = null) {
    await this.services.auditService.record({
      userId: context.authenticatedUserId || null,
      eventType: success ? AUDIT_EVENT_TYPES.MCP_TOOL_CALLED : AUDIT_EVENT_TYPES.MCP_TOOL_FAILED,
      entityType: "MCPTool",
      entityId: name,
      metadata: { tool: name, success, errorCode: error?.code || null, resultType: data?.type || null },
    });
  }
}

export default AgentPayToolRegistry;
