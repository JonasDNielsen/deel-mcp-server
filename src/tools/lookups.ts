import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerLookupTools(server: McpServer): void {
  server.tool(
    "deel_lookup_countries",
    "Get the list of countries supported by Deel with their codes and names.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/countries");
        const countries = res.data;
        if (!countries || countries.length === 0) {
          return success("No countries data available.");
        }
        let output = `${countries.length} supported countries:\n\n`;
        for (const c of countries) {
          output += `- ${c.name ?? "N/A"} (${c.code ?? c.iso_code ?? "N/A"})\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_lookup_currencies",
    "Get the list of currencies supported by Deel with their codes.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/currencies");
        const currencies = res.data;
        if (!currencies || currencies.length === 0) {
          return success("No currencies data available.");
        }
        let output = `${currencies.length} supported currencies:\n\n`;
        for (const c of currencies) {
          output += `- ${c.name ?? c.code ?? "N/A"} (${c.code ?? "N/A"})\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_lookup_job_titles",
    "Browse available job titles on Deel. Returns 99 titles per page with cursor-based pagination. Use the cursor from a previous response to get the next page.",
    {
      cursor: z.string().optional().describe("Pagination cursor from previous response to get next page"),
    },
    async ({ cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/job-titles", params);
        const titles = res.data;
        if (!titles || titles.length === 0) {
          return success("No job titles data available.");
        }
        let output = `${titles.length} job titles:\n\n`;
        for (const t of titles) {
          output += `- ${t.name ?? t.title ?? "N/A"} (ID: ${t.id ?? "N/A"})\n`;
        }
        if (res.page?.cursor) {
          output += `\n[More results available — use cursor: "${res.page.cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_lookup_seniorities",
    "Get the list of seniority levels (e.g. junior, mid, senior, lead).",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/seniorities");
        const seniorities = res.data;
        if (!seniorities || seniorities.length === 0) {
          return success("No seniority data available.");
        }
        let output = `${seniorities.length} seniority levels:\n\n`;
        for (const s of seniorities) {
          output += `- ${s.name ?? s.label ?? "N/A"} (ID: ${s.id ?? "N/A"})\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_adjustment_categories",
    "List available adjustment categories for payroll adjustments (e.g. Train, Flight, Internet, Bonus).",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/adjustments/categories");
        const categories = res.data;
        if (!categories || categories.length === 0) {
          return success("No adjustment categories found.");
        }
        let output = `${categories.length} adjustment categories:\n\n`;
        for (const c of categories) {
          output += `- ${c.name ?? "N/A"} (ID: ${c.id ?? "N/A"}) | Unit: ${c.unit_type ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_webhook_event_types",
    "List available webhook event types that can be subscribed to, with descriptions and example payloads.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/webhooks/events/types");
        const types = res.data;
        if (!types || types.length === 0) {
          return success("No webhook event types found.");
        }
        let output = `${types.length} webhook event types:\n\n`;
        for (const t of types) {
          output += `- ${t.name ?? "N/A"} (${t.module_label ?? t.module_name ?? "N/A"})\n`;
          if (t.description) output += `  ${t.description}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_lookup_time_off_types",
    "Get the list of time off types (e.g. vacation, sick leave, personal).",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<string>>("/lookups/time-off-types");
        const types = res.data;
        if (!types || types.length === 0) {
          return success("No time off type data available.");
        }
        let output = `${types.length} time off types:\n\n`;
        for (const t of types) {
          output += `- ${typeof t === "string" ? t : (t as Record<string, unknown>).name ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
