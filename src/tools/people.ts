import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerPeopleTools(server: McpServer): void {
  server.tool(
    "deel_list_people",
    "List all people (workers/employees) in the organization. Returns name, email, country, hiring status, job title, department, and more for each person. Supports offset-based pagination and filtering by hiring status.",
    {
      hiring_status: z.string().optional().describe("Filter by hiring status (e.g. 'active', 'inactive', 'onboarding')"),
      hiring_type: z.string().optional().describe("Filter by hiring type (e.g. 'direct_employee', 'contractor')"),
      limit: z.number().min(1).max(100).optional().describe("Results per page (max 100)"),
      offset: z.number().min(0).optional().describe("Offset for pagination (default 0)"),
    },
    async ({ hiring_status, hiring_type, limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (hiring_status) params["hiring_status[]"] = hiring_status;
        if (hiring_type) params["hiring_type[]"] = hiring_type;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>("/people", params);
        const people = res.data;
        if (!people || people.length === 0) {
          return success("No people found.");
        }

        const totalRows = res.page?.total_rows;
        let output = `Found ${people.length} person(s)${totalRows ? ` (total: ${totalRows})` : ""}:\n\n`;
        for (const p of people) {
          const emails = p.emails as Array<Record<string, string>> | undefined;
          const workEmail = emails?.find(e => e.type === "work")?.value
            ?? emails?.find(e => e.type === "primary")?.value
            ?? emails?.[0]?.value
            ?? "N/A";
          const dept = p.department as Record<string, unknown> | undefined;

          output += `- ${p.full_name ?? "N/A"} (ID: ${p.id})\n`;
          output += `  Email: ${workEmail} | Country: ${p.country ?? "N/A"}\n`;
          output += `  Status: ${p.hiring_status ?? "N/A"} | Type: ${p.hiring_type ?? "N/A"}\n`;
          output += `  Job Title: ${p.job_title ?? "N/A"} | Dept: ${dept?.name ?? "N/A"}\n`;
          if (p.start_date) output += `  Start Date: ${p.start_date}\n`;
          output += "\n";
        }

        if (totalRows && people.length < totalRows) {
          const currentOffset = offset ?? 0;
          output += `[More results — use offset: ${currentOffset + people.length} | Total: ${totalRows}]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_person",
    "Get detailed information about a specific worker/employee by their ID, including personal details, birth date, nationality, emails, employment type, compensation, direct reports, and custom fields.",
    { worker_id: z.string().describe("The unique Deel worker/person ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown>>(`/people/${worker_id}`);
        const p = res.data;

        // Extract all emails
        const emails = p.emails as Array<Record<string, string>> | undefined;
        let emailLines = "N/A";
        if (emails && emails.length > 0) {
          emailLines = emails.map(e => `${e.value} (${e.type})`).join(", ");
        }

        // Department
        const dept = p.department as Record<string, unknown> | undefined;

        // Direct manager
        const manager = p.direct_manager as Record<string, unknown> | undefined;
        const managerInfo = manager ? `${manager.display_name ?? "N/A"} (${manager.work_email ?? ""})` : "N/A";

        // Nationalities (array)
        const nationalities = p.nationalities as Array<string> | undefined;
        const nationalityStr = nationalities && nationalities.length > 0 ? nationalities.join(", ") : "N/A";

        // Client legal entity
        const legalEntity = p.client_legal_entity as Record<string, unknown> | undefined;

        const lines = [
          `Name: ${p.full_name ?? "N/A"} (First: ${p.first_name ?? "N/A"}, Last: ${p.last_name ?? "N/A"})`,
          `ID: ${p.id ?? worker_id}`,
          `Emails: ${emailLines}`,
          `Country: ${p.country ?? "N/A"}`,
          `Nationality: ${nationalityStr}`,
          `Birth Date: ${p.birth_date ?? "N/A"}`,
          `Hiring Type: ${p.hiring_type ?? "N/A"}`,
          `Hiring Status: ${p.hiring_status ?? "N/A"}`,
          `Start Date: ${p.start_date ?? "N/A"}`,
          `Job Title: ${p.job_title ?? "N/A"}`,
          `Department: ${dept?.name ?? "N/A"}`,
          `Seniority: ${p.seniority ?? "N/A"}`,
          `Manager: ${managerInfo}`,
          `Direct Reports: ${p.direct_reports_count ?? 0}`,
        ];

        if (legalEntity) {
          lines.push(`Legal Entity: ${legalEntity.name ?? "N/A"} (${legalEntity.id ?? "N/A"})`);
        }
        if (p.timezone) lines.push(`Timezone: ${p.timezone}`);
        if (p.completion_date) lines.push(`Completion Date: ${p.completion_date}`);
        if (p.termination_last_day) lines.push(`Termination Last Day: ${p.termination_last_day}`);
        if (p.created_at) lines.push(`Created: ${String(p.created_at).slice(0, 10)}`);
        if (p.preferred_first_name || p.preferred_last_name) {
          lines.push(`Preferred Name: ${p.preferred_first_name ?? ""} ${p.preferred_last_name ?? ""}`.trim());
        }

        // Compensation from employments
        const employments = p.employments as Array<Record<string, unknown>> | undefined;
        if (employments && employments.length > 0) {
          const emp = employments[0];
          const payment = emp.payment as Record<string, unknown> | undefined;
          if (payment) {
            const rate = payment.rate !== undefined && payment.rate !== null ? Number(payment.rate) : null;
            const fmtRate = rate !== null && !isNaN(rate) ? rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A";
            const scaleMap: Record<string, string> = { monthly: "month", hourly: "hour", weekly: "week", yearly: "year", annually: "year", biweekly: "2 weeks" };
            const rawScale = String(payment.scale ?? "N/A").toLowerCase();
            const scale = scaleMap[rawScale] ?? rawScale;
            lines.push(`Compensation: ${fmtRate} ${payment.currency ?? ""} per ${scale}`);
          }
        }

        // Custom fields
        const customFields = p.custom_fields as Array<Record<string, unknown>> | undefined;
        if (customFields && customFields.length > 0) {
          lines.push(`\nCustom Fields:`);
          for (const cf of customFields) {
            lines.push(`  ${cf.label ?? cf.name ?? "Field"}: ${cf.value ?? "N/A"}`);
          }
        }

        return success(lines.join("\n"));
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_headcount_summary",
    "Get a headcount summary for the organization, broken down by country, department, hiring status, and hiring type. Pulls all people and aggregates the counts.",
    {},
    async () => {
      try {
        // Fetch all people (paginate if needed)
        const allPeople: Array<Record<string, unknown>> = [];
        let offset = 0;
        const limit = 100;
        while (true) {
          const res = await deelRequest<Array<Record<string, unknown>>>("/people", { limit, offset });
          allPeople.push(...res.data);
          const total = res.page?.total_rows ?? res.data.length;
          if (allPeople.length >= total || res.data.length < limit) break;
          offset += limit;
        }

        if (allPeople.length === 0) return success("No people found in organization.");

        const byCountry: Record<string, number> = {};
        const byDept: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        const byType: Record<string, number> = {};

        for (const p of allPeople) {
          const country = String(p.country ?? "Unknown");
          byCountry[country] = (byCountry[country] ?? 0) + 1;

          const dept = (p.department as Record<string, unknown> | undefined)?.name ?? "None";
          byDept[String(dept)] = (byDept[String(dept)] ?? 0) + 1;

          const status = String(p.hiring_status ?? "Unknown");
          byStatus[status] = (byStatus[status] ?? 0) + 1;

          const type = String(p.hiring_type ?? "Unknown");
          byType[type] = (byType[type] ?? 0) + 1;
        }

        const sortDesc = (obj: Record<string, number>) =>
          Object.entries(obj).sort((a, b) => b[1] - a[1]);

        let output = `Headcount Summary: ${allPeople.length} total\n\n`;

        output += `By Status:\n`;
        for (const [k, v] of sortDesc(byStatus)) output += `  ${k}: ${v}\n`;

        output += `\nBy Country:\n`;
        for (const [k, v] of sortDesc(byCountry)) output += `  ${k}: ${v}\n`;

        output += `\nBy Department:\n`;
        for (const [k, v] of sortDesc(byDept)) output += `  ${k}: ${v}\n`;

        output += `\nBy Hiring Type:\n`;
        for (const [k, v] of sortDesc(byType)) output += `  ${k}: ${v}\n`;

        return success(output);
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
