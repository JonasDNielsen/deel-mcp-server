import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerDocumentsTools(server: McpServer): void {
  server.tool(
    "deel_list_worker_documents",
    "List documents associated with a specific worker (contracts, tax forms, etc.). Returns metadata only, not file contents.",
    { worker_id: z.string().describe("The unique Deel worker ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/workers/${worker_id}/documents`
        );
        const docs = res.data;
        if (!docs || docs.length === 0) {
          return success(`No documents found for worker ${worker_id}.`);
        }
        let output = `Found ${docs.length} document(s) for worker ${worker_id}:\n\n`;
        for (const d of docs) {
          output += `- ${d.title ?? d.name ?? "Untitled"} (ID: ${d.id})\n`;
          output += `  Type: ${d.type ?? d.category ?? "N/A"} | Created: ${d.created_at ?? "N/A"}\n\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
