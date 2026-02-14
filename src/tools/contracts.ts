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
      cursor: z
        .string()
        .optional()
        .describe("Cursor for pagination (from previous response)"),
    },
    async ({ contract_type, status, limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (contract_type) params.contract_type = contract_type;
        if (status) params["statuses[]"] = status;
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", params);
        const contracts = res.data;
        if (!contracts || contracts.length === 0) {
          return success("No contracts found matching the specified criteria.");
        }

        let output = `Found ${contracts.length} contract(s):\n\n`;
        for (const c of contracts) {
          const worker = c.worker as Record<string, unknown> | null;
          const invitations = c.invitations as Record<string, unknown> | undefined;
          output += `- ${c.title ?? "Untitled"}\n`;
          output += `  ID: ${c.id} | Type: ${c.type ?? "N/A"} | Status: ${c.status ?? "N/A"}\n`;
          if (worker) {
            output += `  Worker: ${worker.full_name ?? worker.name ?? "N/A"} (${worker.email ?? "N/A"})`;
            if (worker.id) output += ` [Worker ID: ${worker.id}]`;
            output += "\n";
          } else if (invitations?.worker_email) {
            output += `  Worker email: ${invitations.worker_email}\n`;
          }
          if (c.created_at) output += `  Created: ${c.created_at}\n`;
          if (c.termination_date) output += `  Termination: ${c.termination_date}\n`;
          output += "\n";
        }

        if (res.page?.cursor) {
          output += `[More results available — use cursor: "${res.page.cursor}" | Total: ${res.page.total_rows ?? "N/A"}]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract",
    "Get full details for a single contract, including compensation/salary, employment details, job title, and worker info. Use this to see salary data that is not included in the contract list.",
    { contract_id: z.string().describe("The unique Deel contract ID (e.g. '3yjd75w')") },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown>>(
          `/contracts/${contract_id}`
        );
        const c = res.data;
        let output = `Contract: ${c.title ?? "Untitled"}\n`;
        output += `ID: ${c.id} | Type: ${c.type ?? "N/A"} | Status: ${c.status ?? "N/A"}\n`;

        const worker = c.worker as Record<string, unknown> | null;
        if (worker) {
          output += `Worker: ${worker.full_name ?? "N/A"} (${worker.email ?? "N/A"}) [ID: ${worker.id ?? "N/A"}]\n`;
          if (worker.country) output += `Country: ${worker.country}\n`;
        }

        const comp = c.compensation_details as Record<string, unknown> | undefined;
        if (comp) {
          output += `\nCompensation:\n`;
          output += `  Amount: ${comp.amount ?? "N/A"} ${comp.currency_code ?? ""}\n`;
          output += `  Scale: ${comp.scale ?? comp.frequency ?? "N/A"}\n`;
          if (comp.first_payment_date) output += `  First payment: ${comp.first_payment_date}\n`;
          if (comp.gross_annual_salary) output += `  Gross annual salary: ${comp.gross_annual_salary}\n`;
        } else {
          output += `\nCompensation: Not available for this contract type.\n`;
        }

        if (c.job_title) output += `Job title: ${c.job_title}\n`;
        if (c.employment_type) output += `Employment type: ${c.employment_type}\n`;
        if (c.start_date) output += `Start date: ${c.start_date}\n`;
        if (c.termination_date) output += `Termination date: ${c.termination_date}\n`;

        const employment = c.employment_details as Record<string, unknown> | undefined;
        if (employment) {
          output += `\nEmployment details:\n`;
          if (employment.type) output += `  Type: ${employment.type}\n`;
          if (employment.days_per_week) output += `  Days/week: ${employment.days_per_week}\n`;
          if (employment.hours_per_day) output += `  Hours/day: ${employment.hours_per_day}\n`;
        }

        const client = c.client as Record<string, unknown> | undefined;
        const legalEntity = client?.legal_entity as Record<string, unknown> | undefined;
        if (legalEntity) {
          output += `Legal entity: ${legalEntity.name ?? "N/A"} (${legalEntity.id ?? "N/A"})\n`;
        }

        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_adjustments",
    "Get compensation adjustments for a specific contract, including salary changes and bonuses. Note: many contracts may have no adjustments if no salary changes have been made.",
    { contract_id: z.string().describe("The unique Deel contract ID") },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/adjustments`
        );
        const adjustments = res.data;
        if (!adjustments || adjustments.length === 0) {
          return success(`No adjustments found for contract ${contract_id}. This is normal if no salary changes, bonuses, or compensation modifications have been recorded for this contract.`);
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
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ contract_id, limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

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
