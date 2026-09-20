import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { AgentPayToolRegistry } from "../mcp/tools/AgentPayToolRegistry.js";
import { createMcpClient } from "../mcp/client/createMcpClient.js";
import { TOOL_CATEGORIES } from "../mcp/schemas/toolSchemas.js";

const userId = new mongoose.Types.ObjectId().toString();
const offerId = new mongoose.Types.ObjectId().toString();
const orderId = new mongoose.Types.ObjectId().toString();
const paymentId = new mongoose.Types.ObjectId().toString();

function createHarness(overrides = {}) {
  const calls = [];
  const audits = [];
  const services = {
    searchOrchestrator: {
      search: async (query) => {
        calls.push(["search", query]);
        return {
          query: query.toObject(),
          results: [{ rank: 1, score: 0.9, rankingReasons: ["test"], product: { title: "Persisted offer", pricePaise: 100, currency: "INR" }, offers: [{ _id: offerId, title: "Persisted offer", pricePaise: 100, currency: "INR", sourceCode: "demo", url: "https://example.test/offer" }] }],
          partial: false,
          successfulSources: [],
          failedSources: [],
          fetchedAt: "2026-09-17T00:00:00.000Z",
        };
      },
    },
    selectionService: { select: async (input) => { calls.push(["select", input]); return { decision: "ALLOWED", offer: { offerId } }; } },
    approvalService: { requestApproval: async (input) => { calls.push(["approval", input]); return { approval: null }; } },
    orderService: { createOrder: async (input) => { calls.push(["order", input]); return { type: "order_result", order: { orderId, totalAmountPaise: 100 } }; } },
    paymentService: {
      createPaymentForOrder: async (input) => { calls.push(["createPayment", input]); return { payment: { paymentId } }; },
      verifyPayment: async (input) => { calls.push(["verifyPayment", input]); return { payment: { paymentId, status: "AUTHORIZED" } }; },
      reconcilePayment: async (input) => { calls.push(["reconcilePayment", input]); return { payment: { paymentId, status: "CAPTURED" }, orderStatus: "PAID" }; },
    },
    auditService: { record: async (input) => audits.push(input) },
    ...overrides,
  };
  return { registry: new AgentPayToolRegistry(services), calls, audits };
}

test("MCP server initializes and exposes the expected tool categories", async () => {
  const { registry } = createHarness();
  assert.deepEqual(registry.listTools(), ["search_products", "select_offer", "check_policy", "request_approval", "create_order", "create_payment", "verify_payment", "reconcile_payment"]);
  assert.deepEqual(TOOL_CATEGORIES.READ_ONLY, ["search_products", "check_policy"]);
  const client = await createMcpClient({ registry, context: { authenticatedUserId: userId } });
  const tools = await client.client.listTools();
  assert.equal(tools.tools.length, 8);
  await client.close();
});

test("search_products validates input and delegates to the search service", async () => {
  const { registry, calls } = createHarness();
  const invalid = await registry.invoke("search_products", { maxPricePaise: -1 });
  assert.equal(invalid.ok, false);
  const result = await registry.invoke("search_products", { query: "laptop", maxPricePaise: 7000000, minRating: 4, requiredAttributes: { ram: "16GB" } });
  assert.equal(result.ok, true);
  assert.equal(result.data.results[0].offerId, offerId);
  assert.equal(calls[0][0], "search");
  assert.equal(calls[0][1].ratingMin, 4);
});

test("search_products uses the original chat message for search persistence", async () => {
  const { registry, calls } = createHarness();
  const result = await registry.invoke("search_products", {
    query: "hoodie",
    originalQuery: "I need a hoodie",
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0][0], "search");
});

test("commerce and payment MCP tools delegate authenticated context and reject missing auth", async () => {
  const { registry, calls } = createHarness();
  const unauthorized = await registry.invoke("create_payment", { orderId });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.error.code, "AUTHENTICATION_ERROR");

  for (const [name, input, expectedCall] of [
    ["check_policy", { offerId }, "select"],
    ["select_offer", { offerId, quantity: 1 }, "select"],
    ["request_approval", { offerId }, "approval"],
    ["create_order", { offerId, idempotencyKey: "mcp-test-key" }, "order"],
    ["create_payment", { orderId }, "createPayment"],
    ["verify_payment", { paymentId, razorpayPaymentId: "pay_1", razorpayOrderId: "order_1", razorpaySignature: "signature" }, "verifyPayment"],
    ["reconcile_payment", { paymentId }, "reconcilePayment"],
  ]) {
    const result = await registry.invoke(name, input, { authenticatedUserId: userId });
    assert.equal(result.ok, true, name);
    assert.equal(calls.at(-1)[0], expectedCall, name);
    assert.equal(calls.at(-1)[1].authenticatedUserId, userId, name);
  }
});

test("create_order delegates without accepting an AI-supplied amount", async () => {
  const { registry, calls } = createHarness();
  const result = await registry.invoke("create_order", { offerId, idempotencyKey: "mcp-amount-test", amountPaise: 1 }, { authenticatedUserId: userId });
  assert.equal(result.ok, true);
  assert.equal(calls.at(-1)[1].amountPaise, undefined);
});

test("tool errors are safe and MCP invocations are audited without secrets", async () => {
  const { registry, audits } = createHarness({
    paymentService: { createPaymentForOrder: async () => { throw Object.assign(new Error("secret failure"), { code: "PAYMENT_ERROR", statusCode: 502 }); } },
  });
  const result = await registry.invoke("create_payment", { orderId }, { authenticatedUserId: userId });
  assert.equal(result.ok, false);
  assert.equal(result.error.message, "The MCP tool could not complete safely.");
  assert.equal(audits.at(-1).eventType, "MCP_TOOL_FAILED");
  assert.equal(JSON.stringify(audits).includes("secret"), false);
});

test("client transport returns a structured error when the tool content is not JSON", async () => {
  const registry = {
    invoke: async () => ({ ok: false, error: { code: "MCP_TRANSPORT_FAILURE", message: "Operation `auditevents.insertOne()` buffering timed out after 10000ms" } }),
  };

  const client = await createMcpClient({ registry, context: { authenticatedUserId: userId } });
  client.client.callTool = async () => ({
    content: [{ type: "text", text: "Operation `auditevents.insertOne()` buffering timed out after 10000ms" }],
    isError: true,
  });

  const result = await client.callTool("search_products", { query: "laptop" });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MCP_TOOL_TRANSPORT_ERROR");
  assert.match(result.error.message, /buffering timed out after 10000ms/i);

  await client.close();
});
