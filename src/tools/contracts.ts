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
        .enum(["global_payroll", "hris_direct_employee", "pay_as_you_go_time_based"])
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
        if (contract_type) params["types[]"] = contract_type;
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
          const amount = comp.amount ?? "N/A";
          const currency = comp.currency_code ?? "";
          const scale = comp.scale ?? comp.frequency ?? "N/A";
          output += `\nCompensation: ${amount} ${currency} per ${scale}\n`;
          if (comp.first_payment_date) output += `  First payment: ${comp.first_payment_date}\n`;
          if (comp.gross_annual_salary) output += `  Gross annual salary: ${comp.gross_annual_salary}\n`;
        } else {
          output += `\nCompensation: Not available for this contract type.\n`;
        }

        if (c.job_title) output += `Job title: ${c.job_title}\n`;
        if (c.seniority) output += `Seniority: ${c.seniority}\n`;
        if (c.employment_type) output += `Employment type: ${c.employment_type}\n`;
        if (c.start_date) output += `Start date: ${c.start_date}\n`;
        if (c.termination_date) output += `Termination date: ${c.termination_date}\n`;
        if (c.scope_of_work) output += `Scope of work: ${c.scope_of_work}\n`;
        if (c.special_clause) output += `Special clause: ${c.special_clause}\n`;
        if (c.notice_period) output += `Notice period: ${c.notice_period}\n`;
        if (c.is_archived) output += `Archived: yes\n`;

        const employment = c.employment_details as Record<string, unknown> | undefined;
        if (employment) {
          output += `\nEmployment details:\n`;
          if (employment.type) output += `  Type: ${employment.type}\n`;
          if (employment.days_per_week) output += `  Days/week: ${employment.days_per_week}\n`;
          if (employment.hours_per_day) output += `  Hours/day: ${employment.hours_per_day}\n`;
        }

        const workSchedule = c.work_schedule as Record<string, unknown> | undefined;
        if (workSchedule) {
          output += `Work schedule: ${JSON.stringify(workSchedule)}\n`;
        }

        const client = c.client as Record<string, unknown> | undefined;
        const legalEntity = client?.legal_entity as Record<string, unknown> | undefined;
        if (legalEntity) {
          output += `Legal entity: ${legalEntity.name ?? "N/A"} (${legalEntity.id ?? "N/A"})\n`;
        }

        // Custom fields
        const customFields = c.custom_fields as Array<Record<string, unknown>> | undefined;
        if (customFields && customFields.length > 0) {
          output += `\nCustom Fields:\n`;
          for (const cf of customFields) {
            output += `  ${cf.label ?? cf.name ?? "Field"}: ${cf.value ?? "N/A"}\n`;
          }
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
    "deel_get_contract_amendments",
    "Get the amendment history for a contract, showing salary changes, contract modifications, and their status. Amendments track changes to terms like compensation.",
    {
      contract_id: z.string().describe("The unique Deel contract ID"),
    },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<unknown>(`/contracts/${contract_id}/amendments`);
        const raw = res as unknown as Record<string, unknown>;
        const amendments = raw.data as Array<Record<string, unknown>> | undefined;
        if (!amendments || amendments.length === 0) {
          return success(`No amendments found for contract ${contract_id}.`);
        }
        const totalCount = raw.total_count ?? amendments.length;
        let output = `Found ${totalCount} amendment(s) for contract ${contract_id}:\n\n`;
        for (const a of amendments) {
          output += `- ${a.contract_name ?? "Amendment"} (ID: ${a.id})\n`;
          output += `  Status: ${a.status ?? "N/A"} | Sign Status: ${a.sign_status ?? "N/A"}\n`;
          output += `  Effective Date: ${a.effective_date ? String(a.effective_date).slice(0, 10) : "N/A"}\n`;
          if (a.rate !== undefined) output += `  Rate: ${a.rate} ${a.currency_code ?? ""} (${a.scale ?? "N/A"})\n`;
          output += `  Created: ${a.created_at ? String(a.created_at).slice(0, 10) : "N/A"}\n\n`;
        }
        if (raw.has_more) {
          output += `[More amendments available — use cursor: "${raw.cursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_contract_custom_fields",
    "List organization-specific custom fields defined for contracts.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/contracts/custom_fields");
        const fields = res.data;
        if (!fields || fields.length === 0) {
          return success("No custom fields defined for contracts.");
        }
        let output = `Found ${fields.length} contract custom field(s):\n\n`;
        for (const f of fields) {
          output += `- ${f.label ?? f.name ?? "Unnamed"} (ID: ${f.id}) | Type: ${f.type ?? "N/A"} | Required: ${f.required ?? false}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_contract_templates",
    "List available contract templates in the organization.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/contract-templates");
        const templates = res.data;
        if (!templates || templates.length === 0) {
          return success("No contract templates found.");
        }
        let output = `Found ${templates.length} contract template(s):\n\n`;
        for (const t of templates) {
          output += `- ${t.title ?? t.name ?? "Untitled"} (ID: ${t.id})\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_off_cycle_payments",
    "Get off-cycle (ad-hoc) payments for a contract, such as bonuses or one-time payments outside the regular payroll cycle.",
    {
      contract_id: z.string().describe("The unique Deel contract ID"),
    },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/off-cycle-payments`
        );
        const payments = res.data;
        if (!payments || payments.length === 0) {
          return success(`No off-cycle payments found for contract ${contract_id}.`);
        }
        let output = `Found ${payments.length} off-cycle payment(s) for contract ${contract_id}:\n\n`;
        for (const p of payments) {
          output += `- ${p.description ?? p.type ?? "Payment"} | Amount: ${p.amount ?? "N/A"} ${p.currency ?? ""} | Status: ${p.status ?? "N/A"} | Date: ${p.date ?? p.created_at ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_tasks",
    "Get onboarding or compliance tasks for a contract, showing task status and requirements.",
    {
      contract_id: z.string().describe("The unique Deel contract ID"),
    },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/tasks`
        );
        const tasks = res.data;
        if (!tasks || tasks.length === 0) {
          return success(`No tasks found for contract ${contract_id}.`);
        }
        let output = `Found ${tasks.length} task(s) for contract ${contract_id}:\n\n`;
        for (const t of tasks) {
          output += `- ${t.title ?? t.name ?? "Task"} | Status: ${t.status ?? "N/A"} | Type: ${t.type ?? "N/A"}\n`;
          if (t.due_date) output += `  Due: ${t.due_date}\n`;
          if (t.description) output += `  ${t.description}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_contract_invoice_adjustments",
    "Get invoice-level adjustments for a contract.",
    {
      contract_id: z.string().describe("The unique Deel contract ID"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    async ({ contract_id, limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (offset !== undefined) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/contracts/${contract_id}/invoice-adjustments`,
          params
        );
        const adjustments = res.data;
        if (!adjustments || adjustments.length === 0) {
          return success(`No invoice adjustments found for contract ${contract_id}.`);
        }
        let output = `Found ${adjustments.length} invoice adjustment(s) for contract ${contract_id}:\n\n`;
        for (const a of adjustments) {
          output += `- ${a.description ?? a.type ?? "Adjustment"} | Amount: ${a.amount ?? "N/A"} ${a.currency ?? ""} | Date: ${a.date ?? a.created_at ?? "N/A"}\n`;
        }
        if (res.page?.total_rows && adjustments.length < res.page.total_rows) {
          const currentOffset = offset ?? 0;
          output += `\n[More results — use offset: ${currentOffset + adjustments.length} | Total: ${res.page.total_rows}]`;
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
