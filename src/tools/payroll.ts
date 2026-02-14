import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerPayrollTools(server: McpServer): void {
  server.tool(
    "deel_get_payroll_reports",
    "Get payroll event reports for a legal entity, showing payroll runs and their status.",
    {
      legal_entity_id: z
        .string()
        .describe("Legal entity ID (use deel_list_legal_entities to find)"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ legal_entity_id, limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/gp/legal-entities/${legal_entity_id}/reports`,
          params
        );
        const reports = res.data;
        if (!reports || reports.length === 0) {
          return success(`No payroll reports found for legal entity ${legal_entity_id}.`);
        }
        let output = `Found ${reports.length} payroll report(s):\n\n`;
        for (const r of reports) {
          output += `- Report ID: ${r.id} | Period: ${r.period ?? r.pay_period ?? "N/A"} | Status: ${r.status ?? "N/A"} | Type: ${r.type ?? "N/A"}\n`;
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
    "deel_get_gross_to_net",
    "Get gross to net calculation breakdown for a payroll report, showing deductions, taxes, and net pay.",
    { gp_report_id: z.string().describe("Global payroll report ID") },
    async ({ gp_report_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/gp/reports/${gp_report_id}/gross_to_net`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No gross-to-net data found for report ${gp_report_id}.`);
          }
          let output = `Gross-to-net breakdown for report ${gp_report_id}:\n\n`;
          for (const item of data) {
            output += `- ${item.employee_name ?? item.worker_name ?? "Worker"}\n`;
            output += `  Gross: ${item.gross_pay ?? item.gross ?? "N/A"} | Deductions: ${item.total_deductions ?? item.deductions ?? "N/A"} | Net: ${item.net_pay ?? item.net ?? "N/A"}\n`;
          }
          return success(output);
        }
        return success(`Gross-to-net for report ${gp_report_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_worker_payslips",
    "Get payslips for a specific worker, showing historical salary payments.",
    {
      worker_id: z.string().describe("The unique Deel worker ID"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ worker_id, limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/gp/workers/${worker_id}/payslips`,
          params
        );
        const payslips = res.data;
        if (!payslips || payslips.length === 0) {
          return success(`No payslips found for worker ${worker_id}.`);
        }
        let output = `Found ${payslips.length} payslip(s) for worker ${worker_id}:\n\n`;
        for (const p of payslips) {
          output += `- Period: ${p.period ?? p.pay_period ?? "N/A"} | Gross: ${p.gross_pay ?? "N/A"} | Net: ${p.net_pay ?? "N/A"} | Status: ${p.status ?? "N/A"}\n`;
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
    "deel_get_worker_banks",
    "Get bank account details on file for a specific worker.",
    { worker_id: z.string().describe("The unique Deel worker ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/gp/workers/${worker_id}/banks`
        );
        const banks = res.data;
        if (!banks || banks.length === 0) {
          return success(`No bank accounts found for worker ${worker_id}.`);
        }
        let output = `Found ${banks.length} bank account(s) for worker ${worker_id}:\n\n`;
        for (const b of banks) {
          output += `- ${b.bank_name ?? "Bank"} | Account: ***${String(b.account_number ?? b.iban ?? "").slice(-4)} | Currency: ${b.currency ?? "N/A"} | Primary: ${b.is_primary ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
