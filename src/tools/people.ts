import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerPeopleTools(server: McpServer): void {
  server.tool(
    "deel_get_person",
    "Get detailed information about a specific worker/employee by their worker ID, including personal details, employment type, and contract status.",
    { worker_id: z.string().describe("The unique Deel worker ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown>>(`/people/${worker_id}`);
        const p = res.data;
        const lines = [
          `Name: ${p.full_name ?? p.first_name ?? "N/A"} ${p.last_name ?? ""}`.trim(),
          `ID: ${p.id ?? worker_id}`,
          `Email: ${p.email ?? "N/A"}`,
          `Country: ${p.country ?? "N/A"}`,
          `Employment Type: ${p.employment_type ?? "N/A"}`,
          `Status: ${p.status ?? "N/A"}`,
          `Hire Date: ${p.hire_date ?? "N/A"}`,
          `Job Title: ${p.job_title ?? "N/A"}`,
          `Department: ${p.department ?? "N/A"}`,
          `Seniority: ${p.seniority ?? "N/A"}`,
        ];
        return success(lines.join("\n"));
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_people_custom_fields",
    "Fetch custom fields defined for people in the organization.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/people/custom_fields");
        const fields = res.data;
        if (!fields || fields.length === 0) {
          return success("No custom fields defined for people.");
        }
        let output = `Found ${fields.length} custom field(s):\n\n`;
        for (const f of fields) {
          output += `- ${f.label ?? f.name ?? "Unnamed"} (ID: ${f.id}) | Type: ${f.type ?? "N/A"} | Required: ${f.required ?? false}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
