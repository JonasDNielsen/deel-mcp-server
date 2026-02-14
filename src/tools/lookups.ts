import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
    "Get the list of available job titles on Deel.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/job-titles");
        const titles = res.data;
        if (!titles || titles.length === 0) {
          return success("No job titles data available.");
        }
        let output = `${titles.length} job titles available:\n\n`;
        for (const t of titles) {
          output += `- ${t.name ?? t.title ?? "N/A"} (ID: ${t.id ?? "N/A"})\n`;
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
    "deel_lookup_time_off_types",
    "Get the list of time off types (e.g. vacation, sick leave, personal).",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/time-off-types");
        const types = res.data;
        if (!types || types.length === 0) {
          return success("No time off type data available.");
        }
        let output = `${types.length} time off types:\n\n`;
        for (const t of types) {
          output += `- ${t.name ?? t.label ?? "N/A"} (ID: ${t.id ?? "N/A"})\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
