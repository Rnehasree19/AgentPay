import { generateAIResponse } from "../services/ai/huggingFaceService.js";
import { ChatService } from "../services/chat/ChatService.js";
import { createProductSearchOrchestrator } from "../services/productSearch/searchRuntime.js";
import { validateChatRequest } from "../validators/chatValidator.js";
import { AgentPayToolRegistry } from "../mcp/tools/AgentPayToolRegistry.js";
import { createMcpClient } from "../mcp/client/createMcpClient.js";

const mcpRegistry = new AgentPayToolRegistry();
const chatService = new ChatService({
  generateAIResponse,
  searchOrchestrator: createProductSearchOrchestrator(),
  mcpClientFactory: (context) => createMcpClient({ registry: mcpRegistry, context }),
});

export async function chat(req, res, next) {
  try {
    validateChatRequest(req.body);

    const response = await chatService.respond(req.body.messages, {
      userId: req.user?.id || null,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
}