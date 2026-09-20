import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "../server/createMcpServer.js";

export async function createMcpClient({ registry, context = {} } = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ registry, context });
  const client = new Client({ name: "agentpay-internal-client", version: "1.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    server,
    async callTool(name, arguments_) {
      const result = await client.callTool({ name, arguments: arguments_ });
      const text = result?.content?.find((item) => item.type === "text")?.text;

      if (!text) {
        return { ok: false, error: { code: "MCP_EMPTY_RESPONSE", message: "The MCP server returned no result." } };
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "MCP_TOOL_TRANSPORT_ERROR",
            message: text,
          },
        };
      }
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export default createMcpClient;
