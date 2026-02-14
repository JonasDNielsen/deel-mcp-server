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
          output += `- Invoice #${inv.number ?? inv.id} | Amount: ${inv.amount ?? inv.total ?? "N/A"} ${inv.currency ?? ""}\n`;
          output += `  Worker: ${inv.worker_name ?? inv.contractor_name ?? "N/A"} | Date: ${inv.issued_date ?? inv.date ?? "N/A"} | Status: ${inv.status ?? "N/A"}\n\n`;
        }
        if (res.page?.total) {
          output += `Total invoices: ${res.page.total}`;
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
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    async ({ date_from, date_to, currencies, limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (date_from) params.date_from = date_from;
        if (date_to) params.date_to = date_to;
        if (currencies) params.currencies = currencies;
        if (limit) params.limit = limit;
        if (offset) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>("/payments", params);
        const payments = res.data;
        if (!payments || payments.length === 0) {
          return success("No payments found matching the criteria.");
        }
        let output = `Found ${payments.length} payment(s):\n\n`;
        for (const p of payments) {
          output += `- Payment ID: ${p.id} | Amount: ${p.amount ?? p.total ?? "N/A"} ${p.currency ?? ""}\n`;
          output += `  Date: ${p.date ?? p.paid_at ?? "N/A"} | Status: ${p.status ?? "N/A"} | Method: ${p.payment_method ?? "N/A"}\n\n`;
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
