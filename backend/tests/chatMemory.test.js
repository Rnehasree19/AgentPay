import test from "node:test";
import assert from "node:assert/strict";

import { ChatService } from "../services/chat/ChatService.js";
import { UserMemoryService, extractExplicitName } from "../services/chat/UserMemoryService.js";

function createMemoryService() {
  const records = new Map();
  return new UserMemoryService({
    memories: {
      async findByUserId(userId) {
        return records.get(String(userId)) || null;
      },
      async updateName(userId, name) {
        const record = { userId, name };
        records.set(String(userId), record);
        return record;
      },
    },
  });
}

function createContextChat(memoryService) {
  return new ChatService({
    memoryService,
    generateAIResponse: async (messages) => {
      const trustedFact = messages.find((message) => message.role === "system" && /user's name is/i.test(message.content));
      if (messages.at(-1)?.content.toLowerCase().includes("what is my name") && trustedFact) {
        return `Your name is ${trustedFact.content.match(/name is ([^.]+)/i)[1]}.`;
      }

      if (messages.at(-1)?.content.toLowerCase().includes("what is my name")) {
        return "I do not know your name yet.";
      }

      return "Thanks, I will remember that for this account.";
    },
    searchOrchestrator: { search: async () => ({}) },
  });
}

test("explicit name is remembered across chats for the same user", async () => {
  const memoryService = createMemoryService();
  const chat = createContextChat(memoryService);
  const userId = "user-a";

  await chat.respond([{ role: "user", content: "hi my name is neha" }], { userId });
  const response = await chat.respond([{ role: "user", content: "what is my name?" }], { userId });

  assert.match(response.content, /Neha/i);
});

test("unknown name is not invented", async () => {
  const chat = createContextChat(createMemoryService());
  const response = await chat.respond([{ role: "user", content: "what is my name?" }], { userId: "user-without-name" });

  assert.match(response.content, /do not know/i);
  assert.doesNotMatch(response.content, /neha|priya/i);
});

test("memory is isolated by authenticated user id", async () => {
  const memoryService = createMemoryService();
  const chat = createContextChat(memoryService);

  await chat.respond([{ role: "user", content: "I am Neha" }], { userId: "user-a" });
  const response = await chat.respond([{ role: "user", content: "what is my name?" }], { userId: "user-b" });

  assert.match(response.content, /do not know/i);
  assert.doesNotMatch(response.content, /neha/i);
});

test("explicit name updates replace the previous stored name", async () => {
  const memoryService = createMemoryService();
  const chat = createContextChat(memoryService);
  const userId = "user-a";

  await chat.respond([{ role: "user", content: "call me Neha" }], { userId });
  await chat.respond([{ role: "user", content: "my name is Priya" }], { userId });
  const response = await chat.respond([{ role: "user", content: "what is my name?" }], { userId });

  assert.match(response.content, /Priya/i);
  assert.doesNotMatch(response.content, /Neha/i);
});

test("name extraction only accepts explicit statements", () => {
  assert.equal(extractExplicitName("My favorite name is Neha"), null);
  assert.equal(extractExplicitName("Please remember my name"), null);
  assert.equal(extractExplicitName("I am fine"), null);
  assert.equal(extractExplicitName("Call me later"), null);
  assert.equal(extractExplicitName("my name is neha"), "Neha");
});