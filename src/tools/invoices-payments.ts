import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerInvoicePaymentTools(server: McpServer): void {
  server.tool(
    "deel_list_invoices",
    "List paid invoices (worker salary invoices) with optional date and entity filtering.",
    {
      issued_from_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      issued_to_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    async ({ issued_from_date, issued_to_date, limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (issued_from_date) params.issued_from_date = issued_from_date;
        if (issued_to_date) params.issued_to_date = issued_to_date;
        if (limit) params.limit = limit;
        if (offset) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>("/invoices", params);
        const invoices = res.data;
        if (!invoices || invoices.length === 0) {
          return success("No invoices found matching the criteria.");
        }
        let output = `Found ${invoices.length} invoice(s):\n\n`;
        for (const inv of invoices) {
          output += `- ${inv.label ?? `Invoice #${inv.id}`} | Amount: ${inv.amount ?? "N/A"} ${inv.currency ?? ""} (Total: ${inv.total ?? "N/A"})\n`;
          output += `  Status: ${inv.status ?? "N/A"} | Created: ${inv.created_at ?? "N/A"} | Paid: ${inv.paid_at ?? "N/A"}\n`;
          const details: string[] = [];
          if (inv.contract_id) details.push(`Contract: ${inv.contract_id}`);
          if (inv.recipient_legal_entity_id) details.push(`Legal entity: ${inv.recipient_legal_entity_id}`);
          if (inv.deel_fee && inv.deel_fee !== "0.00") details.push(`Deel fee: ${inv.deel_fee}`);
          if (inv.is_overdue) details.push("OVERDUE");
          if (inv.due_date) details.push(`Due: ${inv.due_date}`);
          if (details.length > 0) output += `  ${details.join(" | ")}\n`;
          output += "\n";
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_deel_invoices",
    "List Deel fee invoices — the invoices Deel charges your organization for their services.",
    {
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    async ({ limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (limit) params.limit = limit;
        if (offset) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>("/invoices/deel", params);
        const invoices = res.data;
        if (!invoices || invoices.length === 0) {
          return success("No Deel fee invoices found.");
        }
        let output = `Found ${invoices.length} Deel fee invoice(s):\n\n`;
        for (const inv of invoices) {
          output += `- Invoice #${inv.number ?? inv.id} | Amount: ${inv.amount ?? inv.total ?? "N/A"} ${inv.currency ?? ""} | Date: ${inv.issued_date ?? inv.date ?? "N/A"} | Status: ${inv.status ?? "N/A"}\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_payments",
    "List payment receipts with optional date and currency filtering.",
    {
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
      currencies: z.string().optional().describe("Currency code filter (e.g. EUR, USD)"),
      limit: z.number().min(1).max(99).optional().describe("Results per page"),
      cursor: z.string().optional().describe("Cursor for pagination"),
    },
    async ({ date_from, date_to, currencies, limit, cursor }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (date_from) params.date_from = date_from;
        if (date_to) params.date_to = date_to;
        if (currencies) params.currencies = currencies;
        if (limit) params.limit = limit;
        if (cursor) params.cursor = cursor;

        const res = await deelRequest<Record<string, unknown>>("/payments", params);
        const wrapper = res.data;
        const rows = (wrapper.rows ?? []) as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          return success("No payments found matching the criteria.");
        }
        let output = `Found ${rows.length} payment(s):\n\n`;
        for (const p of rows) {
          const method = p.payment_method as Record<string, unknown> | undefined;
          const workers = (p.workers ?? []) as Array<Record<string, unknown>>;
          const workerNames = workers.map(w => w.name ?? "Unknown").join(", ");
          output += `- ${p.label ?? "Payment"} (ID: ${p.id}) | Total: ${p.total ?? "N/A"} ${p.payment_currency ?? ""}\n`;
          output += `  Status: ${p.status ?? "N/A"} | Method: ${method?.type ?? "N/A"} | Paid: ${p.paid_at ?? "N/A"}\n`;
          if (workerNames) output += `  Workers: ${workerNames}\n`;
          output += `  [Use ID "${p.id}" with deel_get_payment_breakdown for details]\n`;
          output += "\n";
        }
        const hasMore = wrapper.has_more;
        const nextCursor = wrapper.next_cursor;
        if (hasMore && nextCursor) {
          output += `[More results available — use cursor: "${nextCursor}"]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_payment_breakdown",
    "Get the detailed breakdown of a specific payment, showing per-worker amounts with component breakdown (work, bonus, expenses, deductions, etc.). Use the payment ID from deel_list_payments (the hash ID, not the REC- label). Note: Global Payroll payments show the Deel payroll entity as the payee — use deel_get_gross_to_net for per-worker GP breakdown.",
    { payment_id: z.string().describe("The unique payment ID (hash format from list_payments, e.g. '8gpu7JRY5bq8r4b83FmBB')") },
    async ({ payment_id }) => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>(
          `/payments/${payment_id}/breakdown`
        );
        const items = res.data;
        if (!items || !Array.isArray(items) || items.length === 0) {
          return success(`No breakdown items found for payment ${payment_id}.`);
        }

        let output = `Payment ${payment_id} breakdown (${items.length} item(s)):\n\n`;
        for (const item of items) {
          const name = item.contractor_employee_name ?? "Unknown";
          const email = item.contractor_email ?? "";
          const total = item.total ?? "N/A";
          const cur = item.currency ?? "";
          const country = item.contract_country ?? "";
          const paidAt = item.payment_date ? String(item.payment_date).slice(0, 10) : "";

          output += `- ${name}${email ? ` (${email})` : ""} | Total: ${total} ${cur}\n`;

          // Show non-zero component amounts
          const components: string[] = [];
          const componentKeys = ["work", "bonus", "expenses", "commissions", "deductions", "overtime", "pro_rata", "others", "processing_fee", "adjustment"];
          for (const key of componentKeys) {
            const val = item[key];
            if (val && val !== "0.00" && val !== "0") {
              components.push(`${key}: ${val}`);
            }
          }
          if (components.length > 0) {
            output += `  Components: ${components.join(", ")}\n`;
          }
          if (country || paidAt) {
            const details: string[] = [];
            if (country) details.push(`Country: ${country}`);
            if (paidAt) details.push(`Paid: ${paidAt}`);
            if (item.contract_type) details.push(`Type: ${item.contract_type}`);
            output += `  ${details.join(" | ")}\n`;
          }
          output += "\n";
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
