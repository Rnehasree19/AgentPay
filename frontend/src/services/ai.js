const API_URL = "http://localhost:5000/api/chat";

export async function sendMessage(messages) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error("Failed to get AI response");
  }

  const payload = await response.json();

  if (payload?.type === "shopping_results") {
    return {
      type: "shopping_results",
      message: typeof payload.message === "string" ? payload.message : "",
      query: payload.query && typeof payload.query === "object" ? payload.query : {},
      results: Array.isArray(payload.results) ? payload.results : [],
      sourceSummary:
        payload.sourceSummary && typeof payload.sourceSummary === "object"
          ? payload.sourceSummary
          : {},
    };
  }

  return {
    type: "chat",
    role: payload?.role || "assistant",
    content: typeof payload?.content === "string" ? payload.content : "",
  };
}