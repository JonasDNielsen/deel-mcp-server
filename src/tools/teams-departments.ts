import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerTeamsDepartmentsTools(server: McpServer): void {
  server.tool(
    "deel_list_teams",
    "List all teams in the organization. Note: the Deel API only returns team name and ID — member lists are not available through this endpoint. Use deel_list_people to see team/department assignments per person.",
    {
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/teams", params);
        const teams = res.data;
        if (!teams || teams.length === 0) {
          return success("No teams found.");
        }
        let output = `Found ${teams.length} team(s):\n\n`;
        for (const t of teams) {
          output += `- ${t.name ?? "Unnamed"} (ID: ${t.id}) | Members: ${t.member_count ?? t.members_count ?? "N/A"}\n`;
        }
        if (res.page?.cursor) {
          output += `\n[More results — use cursor: "${res.page.cursor}"]`;
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
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/departments", params);
        const departments = res.data;
        if (!departments || departments.length === 0) {
          return success("No departments found.");
        }
        let output = `Found ${departments.length} department(s):\n\n`;
        for (const d of departments) {
          output += `- ${d.name ?? "Unnamed"} (ID: ${d.id})\n`;
        }
        if (res.page?.cursor) {
          output += `\n[More results — use cursor: "${res.page.cursor}"]`;
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
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/managers", params);
        const managers = res.data;
        if (!managers || managers.length === 0) {
          return success("No managers found.");
        }
        let output = `Found ${managers.length} manager(s):\n\n`;
        for (const m of managers) {
          const name = m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : (m.name ?? m.full_name ?? "Unnamed");
          output += `- ${name} (ID: ${m.id}) | Email: ${m.email ?? "N/A"}\n`;
        }
        if (res.page?.cursor) {
          output += `\n[More results — use cursor: "${res.page.cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
