import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerPayrollTools(server: McpServer): void {
  server.tool(
    "deel_get_payroll_calendar",
    "Get a payroll calendar view showing report status across all legal entities. Shows which entities have OPEN, LOCKED, or CLOSED payroll for each month.",
    {},
    async () => {
      try {
        // Get all legal entities
        const entRes = await deelRequest<Array<Record<string, unknown>>>("/legal-entities");
        const entities = entRes.data;
        if (!entities || entities.length === 0) {
          return success("No legal entities found.");
        }

        let output = "Payroll Calendar:\n\n";
        for (const entity of entities) {
          const entityId = String(entity.id);
          const entityName = String(entity.name ?? "Unknown");
          try {
            const repRes = await deelRequest<Array<Record<string, unknown>>>(`/gp/legal-entities/${entityId}/reports`);
            const reports = repRes.data;
            if (!reports || reports.length === 0) {
              output += `${entityName}: No payroll reports\n\n`;
              continue;
            }
            output += `${entityName}:\n`;
            // Sort by start_date descending
            reports.sort((a, b) => String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")));
            for (const r of reports) {
              const start = r.start_date ? String(r.start_date).slice(0, 7) : "?";
              const status = String(r.status ?? "N/A");
              const lockDate = r.lock_date ? String(r.lock_date).slice(0, 10) : null;
              output += `  ${start}: ${status}`;
              if (lockDate) output += ` (lock: ${lockDate})`;
              output += ` [ID: ${r.id}]\n`;
            }
            output += "\n";
          } catch {
            output += `${entityName}: Unable to fetch reports\n\n`;
          }
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

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

          // Each field is { currentValue (USD), formattedCurrentValue (USD), label, type }.
          // The API returns all amounts consolidated in USD. To get local-currency
          // amounts we multiply currentValue × fxRate (local units per 1 USD).
          const textVal = (field: unknown): string => {
            if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
              const cv = (field as Record<string, unknown>).currentValue;
              return cv !== null && cv !== undefined ? String(cv) : "N/A";
            }
            return field !== null && field !== undefined ? String(field) : "N/A";
          };

          const numVal = (field: unknown): number | null => {
            if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
              const cv = (field as Record<string, unknown>).currentValue;
              if (cv !== null && cv !== undefined) {
                const n = Number(cv);
                return isNaN(n) ? null : n;
              }
            }
            return null;
          };

          const fmtLocal = (field: unknown, fxRate: number, currency: string): string => {
            const usd = numVal(field);
            if (usd === null) return "N/A";
            if (fxRate === 1 || currency === "USD") {
              return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
            }
            const local = usd * fxRate;
            return `${local.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
          };

          const fieldLabel = (field: unknown, fallback: string): string => {
            if (field && typeof field === "object" && "label" in (field as Record<string, unknown>)) {
              return String((field as Record<string, unknown>).label);
            }
            return fallback;
          };

          // Filter out ghost/empty rows (API sometimes returns trailing null entries)
          const validData = data.filter(item => {
            const row = item as Record<string, unknown>;
            const nameField = row.employeeName as Record<string, unknown> | undefined;
            return nameField?.currentValue != null;
          });

          let output = `Gross-to-net breakdown for report ${gp_report_id} (${validData.length} worker(s)):\n\n`;
          let totalGrossUsd = 0;
          let totalNetUsd = 0;
          let totalEmployerCostUsd = 0;
          let reportCurrency = "";
          let reportFxRate = 1;

          for (const item of validData) {
            const row = item as Record<string, unknown>;
            const name = textVal(row.employeeName);
            const jobTitle = textVal(row.jobTitle);
            const department = textVal(row.employeeDepartment);
            const currency = textVal(row.originalCurrency);
            const convertedCurrency = textVal(row.convertedCurrency);
            const fxRate = numVal(row.fxRate) ?? 1;
            const contractId = textVal(row.contractId);

            if (!reportCurrency) { reportCurrency = currency; reportFxRate = fxRate; }

            // baseSalary may be missing for some countries (e.g. SE uses monthlyGrossSalaryRegularWork)
            const baseSalary = fmtLocal(row.baseSalary ?? row.monthlyGrossSalaryRegularWork, fxRate, currency);
            const grossPay = fmtLocal(row.grossPay, fxRate, currency);
            const netPay = fmtLocal(row.netPay, fxRate, currency);
            const employerCost = fmtLocal(row.employerCost, fxRate, currency);

            totalGrossUsd += numVal(row.grossPay) ?? 0;
            totalNetUsd += numVal(row.netPay) ?? 0;
            totalEmployerCostUsd += numVal(row.employerCost) ?? 0;

            output += `- ${name} (${jobTitle})\n`;
            output += `  Contract: ${contractId} | Dept: ${department}\n`;
            if (currency !== convertedCurrency) {
              output += `  Currency: ${currency} (FX rate: ${fxRate.toFixed(4)} ${currency}/${convertedCurrency})\n`;
            } else {
              output += `  Currency: ${currency}\n`;
            }
            output += `  Base salary: ${baseSalary} | Gross: ${grossPay} | Net: ${netPay} | Employer cost: ${employerCost}\n`;

            // Show employee deductions (ee* fields) and employer contributions (er* fields)
            const eeDeductions: string[] = [];
            const erContributions: string[] = [];
            const otherItems: string[] = [];
            const skipKeys = new Set(["contractId", "employeeName", "employeeNumber", "employeeDepartment",
              "employeePayDate", "costCenter", "entityName", "workerId", "externalWorkerId", "taxId",
              "socialSecurityNumber", "employmentEndDate", "jobTitle", "originalCurrency", "convertedCurrency",
              "fxRate", "totalHours", "baseSalary", "grossPay", "netPay", "employerCost", "netAddition", "netDeduction"]);

            for (const [key, field] of Object.entries(row)) {
              if (skipKeys.has(key)) continue;
              const usd = numVal(field);
              if (usd === null || usd === 0) continue;
              const label = fieldLabel(field, key);
              const amt = fmtLocal(field, fxRate, currency);
              if (key.startsWith("ee") || key === "taxPaid") {
                eeDeductions.push(`${label}: ${amt}`);
              } else if (key.startsWith("er")) {
                erContributions.push(`${label}: ${amt}`);
              } else {
                otherItems.push(`${label}: ${amt}`);
              }
            }
            if (eeDeductions.length > 0) {
              output += `  Employee deductions: ${eeDeductions.join(", ")}\n`;
            }
            if (erContributions.length > 0) {
              output += `  Employer contributions: ${erContributions.join(", ")}\n`;
            }
            if (otherItems.length > 0) {
              output += `  Other: ${otherItems.join(", ")}\n`;
            }
            output += "\n";
          }

          // Totals summary
          const fmtTotal = (usd: number): string => {
            if (reportFxRate === 1 || reportCurrency === "USD") {
              return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
            }
            const local = usd * reportFxRate;
            return `${local.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${reportCurrency}`;
          };
          output += `--- TOTALS (${validData.length} workers) ---\n`;
          output += `  Total Gross: ${fmtTotal(totalGrossUsd)} | Total Net: ${fmtTotal(totalNetUsd)} | Total Employer Cost: ${fmtTotal(totalEmployerCostUsd)}\n`;

          return success(output);
        }
        return success(`Gross-to-net for report ${gp_report_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_gross_to_net_csv",
    "Get gross-to-net payroll data as CSV for a closed payroll report. Useful for spreadsheet analysis and payroll auditing. Note: amounts in the CSV are in the API's consolidated currency (USD) — use the FX Rate and Original Currency columns to convert to local currency.",
    { gp_report_id: z.string().describe("Global payroll report ID (use deel_get_payroll_reports to find CLOSED reports)") },
    async ({ gp_report_id }) => {
      try {
        const res = await deelRequest<unknown>(
          `/gp/reports/${gp_report_id}/gross_to_net/csv`
        );
        // The API returns the CSV as a JSON-encoded string
        const csv = typeof res === "string" ? res : String((res as unknown as Record<string, unknown>).data ?? res);
        if (!csv || csv.length === 0) {
          return success(`No CSV data for report ${gp_report_id}. This report may be OPEN or LOCKED.`);
        }
        const lineCount = csv.split("\n").filter(l => l.trim()).length;
        return success(`Gross-to-net CSV for report ${gp_report_id} (${lineCount - 1} worker rows):\n\n${csv}`);
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
          const from = p.from ? String(p.from).slice(0, 10) : null;
          const to = p.to ? String(p.to).slice(0, 10) : null;
          const period = from && to ? `${from} to ${to}` : (p.period ?? p.pay_period ?? "N/A");
          output += `- ID: ${p.id ?? "N/A"} | Period: ${period} | Status: ${p.status ?? "N/A"}\n`;
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
          const acctNum = String(b.account_number ?? b.iban ?? "");
          const masked = acctNum.length > 4 ? `***${acctNum.slice(-4)}` : acctNum || "N/A";
          output += `- ${b.bank_name ?? "Bank"} | Account: ${masked} | Currency: ${b.currency_code ?? b.currency ?? "N/A"} | Status: ${b.status ?? "N/A"}`;
          if (b.custom_name) output += ` | Name: ${b.custom_name}`;
          if (b.payment_type) output += ` | Type: ${b.payment_type}`;
          output += "\n";
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_worker_bank_guide",
    "Get banking field requirements for a specific worker's country, showing what bank details are needed (e.g. IBAN, account number, routing number) with validation rules.",
    { worker_id: z.string().describe("The unique Deel worker ID (GP workers only)") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/gp/workers/${worker_id}/banks/guide`
        );
        const fields = res.data;
        if (!fields || fields.length === 0) {
          return success(`No bank guide available for worker ${worker_id}.`);
        }
        let output = `Bank form requirements for worker ${worker_id} (${fields.length} field(s)):\n\n`;
        for (const f of fields) {
          const required = f.required ? "REQUIRED" : "optional";
          output += `- ${f.label ?? f.key ?? "Field"} (${f.key ?? "N/A"}) [${f.type ?? "text"}] — ${required}\n`;
          const validations = f.validations as Array<Record<string, unknown>> | undefined;
          if (validations && validations.length > 0) {
            const rules = validations.map(v => `${v.type}: ${v.value}`).join(", ");
            output += `  Validations: ${rules}\n`;
          }
          const allowed = f.values_allowed as Array<Record<string, unknown>> | undefined;
          if (allowed && allowed.length > 0 && allowed.length <= 10) {
            const vals = allowed.map(v => `${v.label ?? v.value}`).join(", ");
            output += `  Allowed values: ${vals}\n`;
          } else if (allowed && allowed.length > 10) {
            output += `  Allowed values: ${allowed.length} options (first 5: ${allowed.slice(0, 5).map(v => v.label ?? v.value).join(", ")}...)\n`;
          }
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
