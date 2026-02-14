import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ToolRegistrar = (server: McpServer) => void;

// Common response wrapper used by tool handlers
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function success(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function error(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
