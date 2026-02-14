import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerBenefitsTools(server: McpServer): void {
  server.tool(
    "deel_get_eor_benefits",
    "Get benefits information for an EOR (Employer of Record) contract, including health, dental, and other benefits.",
    { contract_id: z.string().describe("The EOR contract ID") },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/eor/${contract_id}/benefits`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No benefits found for EOR contract ${contract_id}.`);
          }
          let output = `Benefits for EOR contract ${contract_id}:\n\n`;
          for (const b of data) {
            output += `- ${b.name ?? b.type ?? "Benefit"}: ${b.description ?? "N/A"}\n`;
            if (b.provider) output += `  Provider: ${b.provider}\n`;
            if (b.cost) output += `  Cost: ${b.cost} ${b.currency ?? ""}\n`;
          }
          return success(output);
        }
        return success(`Benefits for EOR contract ${contract_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
