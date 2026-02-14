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
    },
    async ({ legal_entity_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/gp/legal-entities/${legal_entity_id}/reports`
        );
        const reports = res.data;
        if (!reports || reports.length === 0) {
          return success(`No payroll reports found for legal entity ${legal_entity_id}.`);
        }
        let output = `Found ${reports.length} payroll report(s):\n\n`;
        for (const r of reports) {
          const startDate = r.start_date ? String(r.start_date).slice(0, 10) : null;
          const endDate = r.end_date ? String(r.end_date).slice(0, 10) : null;
          const period = startDate && endDate ? `${startDate} to ${endDate}` : "N/A";
          const lockDate = r.lock_date ? String(r.lock_date).slice(0, 10) : null;
          output += `- Report ID: ${r.id} | Period: ${period} | Status: ${r.status ?? "N/A"}`;
          if (lockDate) output += ` | Lock date: ${lockDate}`;
          output += "\n";
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_gross_to_net",
    "Get gross to net calculation breakdown for a payroll report, showing base salary, deductions, taxes, and net pay per worker. Only CLOSED reports have data; OPEN/LOCKED reports return empty.",
    { gp_report_id: z.string().describe("Global payroll report ID (use deel_get_payroll_reports to find CLOSED reports)") },
    async ({ gp_report_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/gp/reports/${gp_report_id}/gross_to_net`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No gross-to-net data found for report ${gp_report_id}. This report may be OPEN or LOCKED — only CLOSED reports contain payroll data.`);
          }
          // Each field in a row is an object: { currentValue, formattedCurrentValue, label, type }
          const val = (field: unknown): string => {
            if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
              const cv = (field as Record<string, unknown>).currentValue;
              return cv !== null && cv !== undefined ? String(cv) : "N/A";
            }
            return field !== null && field !== undefined ? String(field) : "N/A";
          };
          const fmtVal = (field: unknown): string => {
            if (field && typeof field === "object" && "formattedCurrentValue" in (field as Record<string, unknown>)) {
              const fv = (field as Record<string, unknown>).formattedCurrentValue;
              return fv !== null && fv !== undefined ? String(fv) : "N/A";
            }
            return field !== null && field !== undefined ? String(field) : "N/A";
          };

          let output = `Gross-to-net breakdown for report ${gp_report_id} (${data.length} worker(s)):\n\n`;
          for (const item of data) {
            const row = item as Record<string, unknown>;
            const name = val(row.employeeName);
            const jobTitle = val(row.jobTitle);
            const department = val(row.employeeDepartment);
            const currency = val(row.originalCurrency);
            const baseSalary = fmtVal(row.baseSalary ?? row.monthlyGrossSalaryRegularWork);
            const grossPay = fmtVal(row.grossPay);
            const netPay = fmtVal(row.netPay);
            const employerCost = fmtVal(row.employerCost);
            const contractId = val(row.contractId);

            output += `- ${name} (${jobTitle})\n`;
            output += `  Contract: ${contractId} | Dept: ${department} | Currency: ${currency}\n`;
            output += `  Base salary: ${baseSalary} | Gross: ${grossPay} | Net: ${netPay} | Employer cost: ${employerCost}\n`;

            // Show deduction items (ee* fields)
            const deductions: string[] = [];
            for (const [key, field] of Object.entries(row)) {
              if (key.startsWith("ee") || key === "taxPaid") {
                const label = field && typeof field === "object" && "label" in (field as Record<string, unknown>)
                  ? String((field as Record<string, unknown>).label)
                  : key;
                const amount = fmtVal(field);
                if (amount !== "N/A" && amount !== "$0.00" && amount !== "0") {
                  deductions.push(`${label}: ${amount}`);
                }
              }
            }
            if (deductions.length > 0) {
              output += `  Deductions: ${deductions.join(", ")}\n`;
            }
            output += "\n";
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
