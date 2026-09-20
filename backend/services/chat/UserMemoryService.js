import { userMemoryRepository } from "../../repositories/userMemoryRepository.js";

const NAME_PATTERNS = [
  /\bmy name is\s+([A-Za-z][A-Za-z'-]{0,49})\b/i,
  /\bI am\s+([A-Za-z][A-Za-z'-]{0,49})\b/i,
  /\bI'm\s+([A-Za-z][A-Za-z'-]{0,49})\b/i,
  /\bcall me\s+([A-Za-z][A-Za-z'-]{0,49})\b/i,
];

const NON_NAME_VALUES = new Set([
  "a",
  "fine",
  "good",
  "great",
  "happy",
  "here",
  "later",
  "okay",
  "ok",
  "ready",
]);

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[-'])\w/g, (letter) => letter.toUpperCase());
}

export function extractExplicitName(message) {
  if (typeof message !== "string") {
    return null;
  }

  for (const pattern of NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1] && !NON_NAME_VALUES.has(match[1].toLowerCase())) {
      return normalizeName(match[1]);
    }
  }

  return null;
}

export class UserMemoryService {
  constructor({ memories = userMemoryRepository } = {}) {
    this.memories = memories;
  }

  async rememberExplicitFacts(userId, message) {
    if (!userId) {
      return null;
    }

    const name = extractExplicitName(message);
    if (name) {
      await this.memories.updateName(userId, name);
    }

    const memory = await this.memories.findByUserId(userId);
    return memory;
  }

  buildTrustedContext(memory) {
    if (!memory?.name) {
      return null;
    }

    return {
      role: "system",
      content: `Trusted user-provided fact: the user's name is ${memory.name}. Use this fact for relevant follow-up questions. Do not invent additional personal facts.`,
    };
  }
}

export default UserMemoryService;