# AgentPay MCP

AgentPay MCP is a server-side capability layer over existing search, commerce, approval, order, payment, and audit services. It does not access MongoDB or Razorpay directly.

The MCP server registers `search_products`, `select_offer`, `check_policy`, `request_approval`, `create_order`, `create_payment`, `verify_payment`, and `reconcile_payment`. `search_products` and `check_policy` are read-only. The remaining tools are state-changing and require an authenticated user context.

The in-process MCP client uses the official `@modelcontextprotocol/sdk` and carries `authenticatedUserId` in a server-side context closure. No session token, provider secret, payment signature, or frontend credential enters MCP. Express authentication remains the source of user identity.

Every invocation is schema-validated, delegated to the existing service layer, returned as a structured `{ ok, data }` or `{ ok: false, error }` result, and recorded through `AuditService` as `MCP_TOOL_CALLED` or `MCP_TOOL_FAILED`. Tool errors do not expose internal stack traces.
