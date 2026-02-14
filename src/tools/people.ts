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

        // Extract work email from emails array: [{type, value}, ...]
        const emails = p.emails as Array<Record<string, string>> | undefined;
        const workEmail = emails?.find(e => e.type === "work")?.value
          ?? emails?.find(e => e.type === "primary")?.value
          ?? emails?.[0]?.value
          ?? "N/A";

        // Department is an object: {id, name}
        const dept = p.department as Record<string, unknown> | undefined;
        const deptName = dept?.name ?? "N/A";

        // Direct manager
        const manager = p.direct_manager as Record<string, unknown> | undefined;
        const managerInfo = manager ? `${manager.display_name ?? "N/A"} (${manager.work_email ?? ""})` : "N/A";

        const lines = [
          `Name: ${p.full_name ?? p.first_name ?? "N/A"}`,
          `ID: ${p.id ?? worker_id}`,
          `Email: ${workEmail}`,
          `Country: ${p.country ?? "N/A"}`,
          `Hiring Type: ${p.hiring_type ?? "N/A"}`,
          `Hiring Status: ${p.hiring_status ?? "N/A"}`,
          `Start Date: ${p.start_date ?? "N/A"}`,
          `Job Title: ${p.job_title ?? "N/A"}`,
          `Department: ${deptName}`,
          `Seniority: ${p.seniority ?? "N/A"}`,
          `Manager: ${managerInfo}`,
        ];

        // Show compensation from employments if available
        const employments = p.employments as Array<Record<string, unknown>> | undefined;
        if (employments && employments.length > 0) {
          const emp = employments[0];
          const payment = emp.payment as Record<string, unknown> | undefined;
          if (payment) {
            lines.push(`Compensation: ${payment.rate ?? "N/A"} ${payment.currency ?? ""} (${payment.scale ?? "N/A"})`);
          }
        }

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
