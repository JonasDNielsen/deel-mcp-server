import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerOrganizationTools(server: McpServer): void {
  server.tool(
    "deel_get_organization",
    "Get details about your Deel organization including name, type, and configuration.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/organizations");
        const orgs = res.data;
        if (!orgs || orgs.length === 0) {
          return success("No organization data found.");
        }
        const org = orgs[0]!;
        const lines = [
          `Organization: ${org.name ?? "N/A"}`,
          `ID: ${org.id ?? "N/A"}`,
        ];
        return success(lines.join("\n"));
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_legal_entities",
    "List all legal entities in the organization. Legal entities represent your company's registered businesses in different jurisdictions.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/legal-entities");
        const entities = res.data;
        if (!entities || entities.length === 0) {
          return success("No legal entities found.");
        }
        let output = `Found ${entities.length} legal entity(ies):\n\n`;
        for (const e of entities) {
          output += `- ${e.name ?? "Unnamed"} (ID: ${e.id}) | Country: ${e.country ?? "N/A"} | Type: ${e.entity_type ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
