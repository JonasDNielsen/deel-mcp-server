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
          output += `  Status: ${inv.status ?? "N/A"} | Created: ${inv.created_at ?? "N/A"} | Paid: ${inv.paid_at ?? "N/A"}\n\n`;
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
          output += `- ${p.label ?? `Payment ${p.id}`} | Total: ${p.total ?? "N/A"} ${p.payment_currency ?? ""}\n`;
          output += `  Status: ${p.status ?? "N/A"} | Method: ${method?.type ?? "N/A"} | Paid: ${p.paid_at ?? "N/A"}\n`;
          if (workerNames) output += `  Workers: ${workerNames}\n`;
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
    "Get the detailed breakdown of a specific payment, showing individual line items and amounts.",
    { payment_id: z.string().describe("The unique payment ID") },
    async ({ payment_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/payments/${payment_id}/breakdown`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No breakdown items found for payment ${payment_id}.`);
          }
          let output = `Payment ${payment_id} breakdown:\n\n`;
          for (const item of data) {
            output += `- ${item.description ?? item.type ?? "Line item"} | Amount: ${item.amount ?? "N/A"} ${item.currency ?? ""}\n`;
          }
          return success(output);
        }
        return success(`Payment ${payment_id} breakdown:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
