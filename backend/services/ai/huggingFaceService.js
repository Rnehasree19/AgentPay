import { pipeline } from "@huggingface/transformers";

import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../errors/ExternalServiceError.js";

const CHAT_SYSTEM_PROMPT = [
  "You are AgentPay's helpful assistant.",
  "Use explicit facts from the conversation history to answer follow-up questions.",
  "If the user provided their name or another fact, remember it within this conversation.",
  "If a fact was not provided, say you do not know it instead of inventing an answer.",
  "Reply with only the user-facing answer and never expose private reasoning.",
].join(" ");

function normalizeGeneratedText(output) {
  const generated = Array.isArray(output) ? output[0]?.generated_text : output?.generated_text;

  if (typeof generated === "string" && generated.trim()) {
    return generated.trim();
  }

  if (Array.isArray(generated)) {
    const assistantMessage = [...generated].reverse().find(
      (message) => message?.role === "assistant" && typeof message.content === "string"
    );

    if (assistantMessage?.content?.trim()) {
      return assistantMessage.content.trim();
    }
  }

  return null;
}

export function sanitizeModelResponse(content) {
  if (typeof content !== "string") {
    return null;
  }

  if (!/<think\b/i.test(content)) {
    return content;
  }

  const sanitized = content.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").trim();
  return sanitized || null;
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("AI inference timed out.");
      error.code = "AI_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export function createAIService({
  pipelineFactory = pipeline,
  modelId = env.AI_MODEL_ID,
  dtype = env.AI_DTYPE,
  maxNewTokens = env.AI_MAX_NEW_TOKENS,
  timeoutMs = env.AI_TIMEOUT_MS,
} = {}) {
  let pipelinePromise = null;

  async function getPipeline() {
    if (!pipelinePromise) {
      pipelinePromise = pipelineFactory("text-generation", modelId, { dtype })
        .catch((error) => {
          pipelinePromise = null;
          throw error;
        });
    }

    return pipelinePromise;
  }

  async function generateAIResponse(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ExternalServiceError("Unable to generate AI response.");
    }

    try {
      const generator = await getPipeline();
      const modelMessages = [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...messages,
      ];
      const output = await withTimeout(generator(modelMessages, {
        max_new_tokens: maxNewTokens,
        do_sample: false,
        chat_template_kwargs: {
          enable_thinking: false,
        },
      }), timeoutMs);
      const content = sanitizeModelResponse(normalizeGeneratedText(output));

      if (!content) {
        throw new Error("Invalid model response format.");
      }

      return content;
    } catch (error) {
      const code = error?.code === "AI_TIMEOUT" ? "AI_TIMEOUT" : "AI_INFERENCE_FAILED";
      throw new ExternalServiceError("Unable to generate AI response.", { code });
    }
  }

  return { generateAIResponse, getPipeline };
}

const defaultAIService = createAIService();

export const generateAIResponse = defaultAIService.generateAIResponse;
