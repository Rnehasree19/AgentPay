export function createSourceFailureResult({
  sourceCode,
  adapterKey,
  errorCode,
  message,
  durationMs,
  fetchedAt = new Date().toISOString(),
  sourceType = "other",
  sourceName = sourceCode,
  capabilities = [],
}) {
  return {
    sourceCode,
    adapterKey,
    success: false,
    offers: [],
    error: {
      code: errorCode,
      message,
    },
    errorCode,
    durationMs,
    fetchedAt,
    sourceType,
    sourceName,
    capabilities,
  };
}

export function createSourceSuccessResult({
  sourceCode,
  adapterKey,
  offers,
  durationMs,
  fetchedAt = new Date().toISOString(),
  sourceType = "other",
  sourceName = sourceCode,
  capabilities = [],
}) {
  return {
    sourceCode,
    adapterKey,
    success: true,
    offers: Array.isArray(offers) ? offers : [],
    error: null,
    errorCode: null,
    durationMs,
    fetchedAt,
    sourceType,
    sourceName,
    capabilities,
  };
}

export default {
  createSourceFailureResult,
  createSourceSuccessResult,
};
