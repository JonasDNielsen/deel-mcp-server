import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerContractTools(server: McpServer): void {
  server.tool(
    "deel_list_contracts",
    "List all contracts in the organization with optional filtering. Returns contract type, status, worker info, and compensation details.",
    {
      contract_type: z
        .enum(["ongoing", "milestone", "pay_as_you_go", "eor", "gp"])
        .optional()
        .describe("Filter by contract type"),
      status: z
        .enum(["in_progress", "new", "processing", "waiting_for_input", "under_review", "cancelled"])
        .optional()
        .describe("Filter by contract status"),
      limit: z
        .number()
        .min(1)
        .max(99)
        .optional()
        .describe("Results per page (max 99)"),
      after_cursor: z
        .string()
        .optional()
        .describe("Cursor for pagination"),
    },
    async ({ contract_type, status, limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (contract_type) params.contract_type = contract_type;
        if (status) params["statuses[]"] = status;
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", params);
        const contracts = res.data;
        if (!contracts || contracts.length === 0) {
          return success("No contracts found matching the specified criteria.");
        }

        let output = `Found ${contracts.length} contract(s):\n\n`;
        for (const c of contracts) {
          const worker = c.worker as Record<string, unknown> | undefined;
          const compensation = c.compensation as Record<string, unknown> | undefined;
          output += `- ${c.title ?? "Untitled"}\n`;
          output += `  ID: ${c.id} | Type: ${c.type ?? "N/A"} | Status: ${c.status ?? "N/A"}\n`;
          if (worker) output += `  Worker: ${worker.name ?? worker.full_name ?? "N/A"}\n`;
          if (compensation) output += `  Compensation: ${compensation.amount ?? "N/A"} ${compensation.currency ?? ""} (${compensation.cycle ?? "N/A"})\n`;
          output += "\n";
        }

        if (res.page?.after_cursor) {
          output += `[More results available — use after_cursor: "${res.page.after_cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_adjustments",
    "Get compensation adjustments for a specific contract, including salary changes and bonuses.",
    { contract_id: z.string().describe("The unique Deel contract ID") },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/adjustments`
        );
        const adjustments = res.data;
        if (!adjustments || adjustments.length === 0) {
          return success(`No adjustments found for contract ${contract_id}.`);
        }
        let output = `Found ${adjustments.length} adjustment(s) for contract ${contract_id}:\n\n`;
        for (const a of adjustments) {
          output += `- ${a.description ?? a.type ?? "Adjustment"} | Amount: ${a.amount ?? "N/A"} ${a.currency ?? ""} | Date: ${a.date ?? a.created_at ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_timesheets",
    "Get timesheets submitted for a specific contract, including hours worked and approval status.",
    {
      contract_id: z.string().describe("The unique Deel contract ID"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      after_cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ contract_id, limit, after_cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (after_cursor) params.after_cursor = after_cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/timesheets`,
          params
        );
        const timesheets = res.data;
        if (!timesheets || timesheets.length === 0) {
          return success(`No timesheets found for contract ${contract_id}.`);
        }
        let output = `Found ${timesheets.length} timesheet(s) for contract ${contract_id}:\n\n`;
        for (const t of timesheets) {
          output += `- ${t.description ?? "Timesheet"} | Hours: ${t.quantity ?? t.hours ?? "N/A"} | Status: ${t.status ?? "N/A"} | Date: ${t.date_submitted ?? t.created_at ?? "N/A"}\n`;
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
