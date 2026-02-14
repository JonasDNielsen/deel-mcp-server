import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerTimeOffTools(server: McpServer): void {
  server.tool(
    "deel_list_time_off_requests",
    "List time off requests across the organization, with optional filtering by contract or status.",
    {
      contract_id: z.string().optional().describe("Filter by contract ID"),
      status: z
        .enum(["approved", "pending", "declined", "cancelled"])
        .optional()
        .describe("Filter by request status"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      after_cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ contract_id, status, limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (contract_id) params.contract_id = contract_id;
        if (status) params.status = status;
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/time-off", params);
        const requests = res.data;
        if (!requests || requests.length === 0) {
          return success("No time off requests found.");
        }
        let output = `Found ${requests.length} time off request(s):\n\n`;
        for (const r of requests) {
          output += `- ${r.type ?? "Time Off"} | ${r.start_date ?? "N/A"} to ${r.end_date ?? "N/A"}\n`;
          output += `  Worker: ${r.worker_name ?? r.employee_name ?? "N/A"} | Status: ${r.status ?? "N/A"} | Days: ${r.days ?? r.duration ?? "N/A"}\n\n`;
        }
        if (res.page?.after_cursor) {
          output += `[More results — use after_cursor: "${res.page.after_cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_time_off_entitlements",
    "Get time off entitlements (available days/hours) for a specific worker.",
    { worker_id: z.string().describe("The unique Deel worker ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/workers/${worker_id}/time-off/entitlements`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No time off entitlements found for worker ${worker_id}.`);
          }
          let output = `Time off entitlements for worker ${worker_id}:\n\n`;
          for (const e of data) {
            output += `- ${e.type ?? e.name ?? "Entitlement"}: ${e.balance ?? e.remaining ?? "N/A"} days remaining (Total: ${e.total ?? e.allowance ?? "N/A"})\n`;
          }
          return success(output);
        }
        return success(`Time off entitlements for worker ${worker_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
