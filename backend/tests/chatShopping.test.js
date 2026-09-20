import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { ChatService } from "../services/chat/ChatService.js";
import { ShoppingIntentService } from "../services/chat/ShoppingIntentService.js";
import { createAIService, sanitizeModelResponse } from "../services/ai/huggingFaceService.js";

const shoppingMessage = "I need a laptop under ₹70,000 with 16GB RAM, mainly for coding.";

function createChatService(overrides = {}) {
  return new ChatService({
    generateAIResponse: async () => "generic model response",
    searchOrchestrator: {
      search: async () => ({
        query: {
          queryText: "laptop",
          category: "laptop",
          maxPricePaise: 7000000,
          attributes: { ram: "16GB", usage: "coding" },
        },
        results: [
          {
            score: 0.91,
            rankingReasons: ["Competitive price", "Currently in stock"],
            product: {
              productKey: "demo-laptop-001",
              title: "AgentPay Studio 14",
              brand: "AgentPay Labs",
              category: "laptop",
              pricePaise: 6499900,
              currency: "INR",
              availability: "in_stock",
            },
            offers: [
              {
                _id: new mongoose.Types.ObjectId().toString(),
                sourceCode: "demo_store",
                sourceProductId: "demo-laptop-001",
                title: "AgentPay Studio 14",
                brand: "AgentPay Labs",
                category: "laptop",
                pricePaise: 6499900,
                currency: "INR",
                availability: "in_stock",
                url: "https://demo.agentpay.local/products/laptop/studio-14",
                attributes: { ram: "16GB", usage: "coding" },
                fetchedAt: "2026-09-01T00:00:00.000Z",
              },
            ],
          },
        ],
        partial: false,
        successfulSources: [{ sourceCode: "demo_store" }],
        failedSources: [],
        metadata: { candidatesReceived: 1 },
        fetchedAt: "2026-09-16T00:00:00.000Z",
      }),
    },
    ...overrides,
  });
}

test("normal message remains generic chat", async () => {
  let searchCalled = false;
  const service = createChatService({
    searchOrchestrator: { search: async () => { searchCalled = true; } },
  });

  const response = await service.respond([{ role: "user", content: "Hello, what can you help me with?" }]);

  assert.deepEqual(response, {
    type: "chat",
    role: "assistant",
    content: "generic model response",
  });
  assert.equal(searchCalled, false);
});

test("shopping request is detected and normalized into the search contract", () => {
  const intent = new ShoppingIntentService().extract(shoppingMessage);

  assert.equal(intent.isShoppingRequest, true);
  assert.equal(intent.query.category, "laptop");
  assert.equal(intent.query.maxPricePaise, 7000000);
  assert.equal(intent.query.attributes.ram, "16GB");
  assert.equal(intent.query.attributes.usage, "coding");
});

test("shopping request calls product search and returns actual offer data", async () => {
  let receivedQuery;
  const service = createChatService({
    searchOrchestrator: {
      search: async (query) => {
        receivedQuery = query;
        return createChatService().searchOrchestrator.search(query);
      },
    },
  });

  const response = await service.respond([{ role: "user", content: shoppingMessage }]);

  assert.equal(receivedQuery.maxPricePaise, 7000000);
  assert.equal(response.type, "shopping_results");
  assert.equal(response.results[0].title, "AgentPay Studio 14");
  assert.equal(response.results[0].pricePaise, 6499900);
  assert.equal(response.results[0].url, "https://demo.agentpay.local/products/laptop/studio-14");
  assert.deepEqual(response.results[0].rankingReasons, ["Competitive price", "Currently in stock"]);
});

test("no product results never produce invented recommendations", async () => {
  const service = createChatService({
    searchOrchestrator: { search: async () => ({ results: [], query: {}, failedSources: [], partial: false }) },
  });

  const response = await service.respond([{ role: "user", content: shoppingMessage }]);

  assert.equal(response.type, "shopping_results");
  assert.deepEqual(response.results, []);
  assert.match(response.message, /could not find products/i);
});

test("invalid structured query is rejected by the shared query validator", () => {
  assert.throws(
    () => new ShoppingIntentService().validateStructuredQuery({ unsupported: "value" }),
    /Unsupported search query field/,
  );
});

test("product-search failure is handled without invented product data", async () => {
  const service = createChatService({
    searchOrchestrator: { search: async () => { throw new Error("source unavailable"); } },
  });

  const response = await service.respond([{ role: "user", content: shoppingMessage }]);

  assert.equal(response.type, "shopping_results");
  assert.deepEqual(response.results, []);
  assert.match(response.message, /could not complete product search/i);
});

test("hoodie shopping request preserves the hoodie category", () => {
  const intent = new ShoppingIntentService().extract("I need a hoodie");

  assert.equal(intent.isShoppingRequest, true);
  assert.equal(intent.query.category, "hoodie");
  assert.equal(intent.query.queryText, "hoodie");
});

test("hoodie shopping request extracts color and size attributes", () => {
  const intent = new ShoppingIntentService().extract("I need a BLACK hoodie in size m");

  assert.equal(intent.query.attributes.color, "black");
  assert.equal(intent.query.attributes.size, "M");
});

test("normal chat removes multiline model thinking before returning content", async () => {
  const service = createChatService({
    generateAIResponse: async () => "<think>\nPrivate reasoning\nMore reasoning\n</think>\nHello there!",
  });

  const response = await service.respond([{ role: "user", content: "hii" }]);

  assert.equal(response.content, "Hello there!");
  assert.doesNotMatch(response.content, /<think>|<\/think>/i);
});

test("responses without thinking markup remain unchanged", () => {
  const response = "Hello without hidden reasoning.";

  assert.equal(sanitizeModelResponse(response), response);
});

test("empty response after thinking removal uses the existing AI error path", async () => {
  const service = createChatService({
    generateAIResponse: async () => "<think>Only private reasoning.</think>",
  });

  await assert.rejects(
    () => service.respond([{ role: "user", content: "hii" }]),
    (error) => error.code === "EXTERNAL_SERVICE_ERROR"
  );
});

test("normal chat passes ordered conversation history to the model", async () => {
  let receivedMessages;
  const service = createChatService({
    generateAIResponse: async (messages) => {
      receivedMessages = messages;
      return "Your name is Neha.";
    },
  });

  const response = await service.respond([
    { role: "user", content: "hi my name is neha" },
    { role: "assistant", content: "Nice to meet you, Neha." },
    { role: "user", content: "what is my name?" },
  ]);

  assert.equal(response.content, "Your name is Neha.");
  assert.deepEqual(receivedMessages, [
    { role: "user", content: "hi my name is neha" },
    { role: "assistant", content: "Nice to meet you, Neha." },
    { role: "user", content: "what is my name?" },
  ]);
});

test("AI service adds grounding instructions without dropping conversation history", async () => {
  let receivedMessages;
  const service = createAIService({
    pipelineFactory: async () => async (messages) => {
      receivedMessages = messages;
      return [{ generated_text: "I do not know your name yet." }];
    },
  });

  const response = await service.generateAIResponse([
    { role: "user", content: "what is my name?" },
  ]);

  assert.equal(response, "I do not know your name yet.");
  assert.equal(receivedMessages[0].role, "system");
  assert.match(receivedMessages[0].content, /provided|inventing/i);
  assert.deepEqual(receivedMessages.at(-1), { role: "user", content: "what is my name?" });
});