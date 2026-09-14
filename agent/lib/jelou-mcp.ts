const DEFAULT_MCP_URL = "https://docs.jelou.ai/mcp";

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function getMcpUrl() {
  return process.env.JELOU_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

function parseSseJsonRpc(body: string): JsonRpcSuccess {
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error("Respuesta MCP inválida: no hay evento data");
  }

  const payload = JSON.parse(dataLine.slice(6)) as JsonRpcSuccess;
  if (payload.error) {
    throw new Error(`MCP error ${payload.error.code}: ${payload.error.message}`);
  }
  return payload;
}

async function mcpRequest(
  method: string,
  params: Record<string, unknown>,
  id = 1,
): Promise<unknown> {
  const response = await fetch(getMcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}`);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream") || text.startsWith("event:")) {
    return parseSseJsonRpc(text).result;
  }

  const json = JSON.parse(text) as JsonRpcSuccess;
  if (json.error) {
    throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  }
  return json.result;
}

function extractToolText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return String(result ?? "");
  }

  const content = (
    result as { content?: Array<{ type?: string; text?: string }> }
  ).content;

  if (!Array.isArray(content)) {
    return JSON.stringify(result);
  }

  return content
    .map((part) =>
      part.type === "text" ? (part.text ?? "") : JSON.stringify(part),
    )
    .filter(Boolean)
    .join("\n\n");
}

export async function searchJelouDocs(query: string, language = "es") {
  const result = await mcpRequest("tools/call", {
    name: "search_jelou_ai_docs",
    arguments: { query, language },
  });
  return extractToolText(result);
}

export async function queryJelouDocsFilesystem(command: string) {
  const result = await mcpRequest("tools/call", {
    name: "query_docs_filesystem_jelou_ai_docs",
    arguments: { command },
  });
  return extractToolText(result);
}
