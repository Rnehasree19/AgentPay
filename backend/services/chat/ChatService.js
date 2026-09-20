import { ShoppingIntentService } from "./ShoppingIntentService.js";
import { ShoppingResponseFormatter } from "./ShoppingResponseFormatter.js";
import { sanitizeModelResponse } from "../ai/huggingFaceService.js";
import { ExternalServiceError } from "../../errors/ExternalServiceError.js";
import { UserMemoryService } from "./UserMemoryService.js";

export class ChatService {
  constructor({ generateAIResponse, searchOrchestrator, intentService, responseFormatter, mcpClientFactory = null, memoryService = new UserMemoryService() } = {}) {
    this.generateAIResponse = generateAIResponse;
    this.searchOrchestrator = searchOrchestrator;
    this.intentService = intentService || new ShoppingIntentService();
    this.responseFormatter = responseFormatter || new ShoppingResponseFormatter();
    this.mcpClientFactory = mcpClientFactory;
    this.memoryService = memoryService;
  }

  async respond(messages, context = {}) {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const intent = this.intentService.extract(latestUserMessage?.content || "");

    if (!intent.isShoppingRequest) {
      const memory = await this.memoryService.rememberExplicitFacts(
        context.userId || null,
        latestUserMessage?.content || ""
      );
      const trustedContext = this.memoryService.buildTrustedContext(memory);
      const modelMessages = trustedContext ? [trustedContext, ...messages] : messages;
      const content = sanitizeModelResponse(await this.generateAIResponse(modelMessages));
      if (!content || !content.trim()) {
        throw new ExternalServiceError("Unable to generate AI response.");
      }
      return { type: "chat", role: "assistant", content };
    }

    try {
      const searchResult = this.mcpClientFactory
        ? await this.searchThroughMcp(intent.query, context, latestUserMessage?.content || "")
        : await this.searchOrchestrator.search(intent.query, {
          ...context,
          originalQuery: latestUserMessage?.content || "",
        });
      return this.responseFormatter.format(searchResult);
    } catch (error) {
      return {
        type: "shopping_results",
        message: "I could not complete product search right now. Please try again later.",
        query: intent.query,
        results: [],
        sourceSummary: {
          partial: false,
          successfulSources: [],
          failedSources: [],
          metadata: { errorCode: error?.code || "PRODUCT_SEARCH_ERROR" },
          fetchedAt: new Date().toISOString(),
        },
      };
    }
  }

  async searchThroughMcp(query, context, originalQuery) {
    const mcpClient = await this.mcpClientFactory({ authenticatedUserId: context.userId || null });
    try {
      const result = await mcpClient.callTool("search_products", {
        query: query.queryText,
        originalQuery,
        minPricePaise: query.minPricePaise ?? undefined,
        maxPricePaise: query.maxPricePaise ?? undefined,
        category: query.category || undefined,
        requiredAttributes: query.attributes,
      });
      if (!result.ok) {
        throw Object.assign(new Error(result.error.message), { code: result.error.code });
      }

      return {
        query: query.toObject(),
        results: result.data.results.map((offer) => {
          const canonicalId = offer?._id ?? offer?.offerId ?? null;
          const normalizedOffer = {
            ...offer,
            _id: canonicalId,
            offerId: canonicalId,
          };

          return {
            rank: offer.rank,
            score: offer.score,
            rankingReasons: offer.rankingReasons,
            product: normalizedOffer,
            offers: [normalizedOffer],
          };
        }),
        partial: result.data.partial,
        successfulSources: result.data.successfulSources,
        failedSources: result.data.failedSources,
        fetchedAt: result.data.fetchedAt,
        persistenceAvailable: result.data.persistenceAvailable,
        metadata: { originalQuery },
      };
    } finally {
      await mcpClient.close();
    }
  }
}

export default ChatService;