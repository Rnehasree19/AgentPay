import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AgentPayToolRegistry } from "../tools/AgentPayToolRegistry.js";
import { toolSchemas } from "../schemas/toolSchemas.js";

function toolInputSchema(schema) {
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value instanceof z.ZodType ? value : value]));
}

export function createMcpServer({ registry = new AgentPayToolRegistry(), context = {} } = {}) {
  const server = new McpServer({ name: "agentpay", version: "1.0.0" });

  for (const [name, schema] of Object.entries(toolSchemas)) {
    server.registerTool(name, {
      description: `AgentPay ${name.replaceAll("_", " ")} tool.`,
      inputSchema: toolInputSchema(schema),
      annotations: {
        readOnlyHint: ["search_products", "check_policy"].includes(name),
        destructiveHint: false,
      },
    }, async (input) => {
      const result = await registry.invoke(name, input, context);
      return {
        isError: !result.ok,
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    });
  }

  return server;
}

export default createMcpServer;
