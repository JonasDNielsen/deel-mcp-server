import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

// The /time_offs endpoint uses a non-standard response shape:
// { page_size, count, has_next_page, next, data: [...] }
// Auto-paginate through all pages using the `next` cursor.
async function fetchAllTimeOff(
  status?: string,
  startDate?: string,
  endDate?: string
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  do {
    const params: Record<string, string | number | undefined> = {};
    if (status) params["status[]"] = status;
    if (startDate) params.start_date = `${startDate}T00:00:00Z`;
    if (endDate) params.end_date = `${endDate}T23:59:59Z`;
    if (cursor) params.next = cursor;

    const res = await deelRequest<unknown>("/time_offs", params);
    const raw = res as unknown as Record<string, unknown>;

    // Extract data array from the non-standard response shape
    const data = raw.data;
    if (Array.isArray(data)) {
      all.push(...data);
    }

    // Follow cursor if more pages exist
    const hasNext = raw.has_next_page as boolean | undefined;
    cursor = hasNext ? (raw.next as string | undefined) : undefined;
  } while (cursor);
  return all;
}

export function registerTimeOffTools(server: McpServer): void {
  server.tool(
    "deel_list_time_off_requests",
    "List time off requests across the organization. Returns ALL matching records (auto-paginates through all pages). Supports filtering by status and date range. Use start_date/end_date to limit results to a specific period (YYYY-MM-DD).",
    {
      status: z
        .enum(["APPROVED", "REQUESTED", "USED", "CANCELED", "REJECTED"])
        .optional()
        .describe("Filter by request status (REQUESTED = pending approval)"),
      start_date: z
        .string()
        .optional()
        .describe("Filter requests starting on or after this date (YYYY-MM-DD)"),
      end_date: z
        .string()
        .optional()
        .describe("Filter requests starting on or before this date (YYYY-MM-DD)"),
    },
    async ({ status, start_date, end_date }) => {
      try {
        const requests = await fetchAllTimeOff(status, start_date, end_date);

        if (requests.length === 0) {
          return success("No time off requests found.");
        }
        let output = `Found ${requests.length} time off request(s):\n\n`;
        for (const r of requests) {
          const recipientProfile = r.recipient_profile as Record<string, unknown> | undefined;
          const workerIdentifier = recipientProfile?.work_email ?? recipientProfile?.hris_profile_id ?? "N/A";
          const timeOffType = r.time_off_type as Record<string, unknown> | undefined;
          const typeName = timeOffType?.name ?? r.type ?? "Time Off";
          output += `- ${typeName} | ${r.start_date ?? "N/A"} to ${r.end_date ?? "N/A"}\n`;
          output += `  Worker: ${workerIdentifier} | Status: ${r.status ?? "N/A"} | Amount: ${r.deduction_amount ?? r.amount ?? "N/A"} days | Paid: ${r.is_paid ?? "N/A"}\n\n`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_time_off_entitlements",
    "Get time off entitlements and policies for a specific worker by their HRIS profile ID.",
    { hris_profile_id: z.string().describe("The worker's HRIS profile ID") },
    async ({ hris_profile_id }) => {
      try {
        const res = await deelRequest<unknown>(
          `/time_offs/profile/${hris_profile_id}/entitlements`
        );
        // Response shape: { entitlements: [...], hris_profile_id: "..." }
        const raw = res as unknown as Record<string, unknown>;
        const entitlements = (raw.data as Record<string, unknown>)?.entitlements ?? raw.entitlements;
        if (!Array.isArray(entitlements) || entitlements.length === 0) {
          return success(`No time off entitlements found for profile ${hris_profile_id}.`);
        }
        let output = `Time off entitlements for profile ${hris_profile_id}:\n\n`;
        for (const e of entitlements as Array<Record<string, unknown>>) {
          const policy = e.policy as Record<string, unknown> | undefined;
          const policyType = policy?.policy_type as Record<string, unknown> | undefined;
          const name = policy?.name ?? policyType?.name ?? "Entitlement";
          const available = e.available ?? "N/A";
          const used = e.used ?? "0";
          const total = e.total_entitlements ?? e.allowance ?? "N/A";
          const unlimited = e.is_allowance_unlimited ? " (unlimited)" : "";
          const period = e.tracking_period ?? "";
          const periodEnd = e.tracking_period_end_date ? ` ends ${e.tracking_period_end_date}` : "";
          output += `- ${name}: ${available} days available, ${used} used (Total: ${total}${unlimited})`;
          if (period) output += ` | Period: ${period}${periodEnd}`;
          output += "\n";
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
