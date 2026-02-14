import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerTeamsDepartmentsTools(server: McpServer): void {
  server.tool(
    "deel_list_teams",
    "List all teams in the organization.",
    {
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      after_cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/teams", params);
        const teams = res.data;
        if (!teams || teams.length === 0) {
          return success("No teams found.");
        }
        let output = `Found ${teams.length} team(s):\n\n`;
        for (const t of teams) {
          output += `- ${t.name ?? "Unnamed"} (ID: ${t.id}) | Members: ${t.member_count ?? t.members_count ?? "N/A"}\n`;
        }
        if (res.page?.after_cursor) {
          output += `\n[More results — use after_cursor: "${res.page.after_cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_departments",
    "List all departments in the organization.",
    {
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      after_cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/departments", params);
        const departments = res.data;
        if (!departments || departments.length === 0) {
          return success("No departments found.");
        }
        let output = `Found ${departments.length} department(s):\n\n`;
        for (const d of departments) {
          output += `- ${d.name ?? "Unnamed"} (ID: ${d.id})\n`;
        }
        if (res.page?.after_cursor) {
          output += `\n[More results — use after_cursor: "${res.page.after_cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_managers",
    "List all managers in the organization with their reporting structure.",
    {
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      after_cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/managers", params);
        const managers = res.data;
        if (!managers || managers.length === 0) {
          return success("No managers found.");
        }
        let output = `Found ${managers.length} manager(s):\n\n`;
        for (const m of managers) {
          output += `- ${m.name ?? m.full_name ?? "Unnamed"} (ID: ${m.id}) | Email: ${m.email ?? "N/A"} | Direct Reports: ${m.direct_reports_count ?? "N/A"}\n`;
        }
        if (res.page?.after_cursor) {
          output += `\n[More results — use after_cursor: "${res.page.after_cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
