import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerTimeOffTools(server: McpServer): void {
  server.tool(
    "deel_list_time_off_requests",
    "List time off requests across the organization. Uses cursor-based pagination with 'next' parameter.",
    {
      contract_id: z.string().optional().describe("Filter by contract ID"),
      status: z
        .enum(["approved", "pending", "declined", "cancelled"])
        .optional()
        .describe("Filter by request status"),
      next: z.string().optional().describe("Pagination cursor from previous response"),
    },
    async ({ contract_id, status, next }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (contract_id) params.contract_id = contract_id;
        if (status) params.status = status;
        if (next) params.next = next;

        const res = await deelRequest<unknown>("/time_offs", params);
        const raw = res as unknown as Record<string, unknown>;
        const data = raw.data as Record<string, unknown> | undefined;

        // The time_offs endpoint may nest data differently
        let requests: Array<Record<string, unknown>> = [];
        if (Array.isArray(data)) {
          requests = data;
        } else if (data && typeof data === "object") {
          // Data might contain a nested array
          const items = (data as Record<string, unknown>).items ?? (data as Record<string, unknown>).time_offs;
          if (Array.isArray(items)) requests = items;
          else requests = [data as Record<string, unknown>];
        }

        if (requests.length === 0) {
          return success("No time off requests found.");
        }
        let output = `Found ${requests.length} time off request(s):\n\n`;
        for (const r of requests) {
          const recipientProfile = r.recipient_profile as Record<string, unknown> | undefined;
          const recipientName = recipientProfile
            ? `${recipientProfile.first_name ?? ""} ${recipientProfile.last_name ?? ""}`.trim()
            : "N/A";
          const timeOffType = r.time_off_type as Record<string, unknown> | undefined;
          const typeName = timeOffType?.name ?? r.type ?? "Time Off";
          output += `- ${typeName} | ${r.start_date ?? "N/A"} to ${r.end_date ?? "N/A"}\n`;
          output += `  Worker: ${recipientName} | Status: ${r.status ?? "N/A"} | Amount: ${r.deduction_amount ?? r.amount ?? "N/A"} days | Paid: ${r.is_paid ?? "N/A"}\n\n`;
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
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/time_offs/profile/${hris_profile_id}/entitlements`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No time off entitlements found for profile ${hris_profile_id}.`);
          }
          let output = `Time off entitlements for profile ${hris_profile_id}:\n\n`;
          for (const e of data) {
            output += `- ${e.type ?? e.name ?? "Entitlement"}: ${e.balance ?? e.remaining ?? "N/A"} days remaining (Total: ${e.total ?? e.allowance ?? "N/A"})\n`;
          }
          return success(output);
        }
        return success(`Time off entitlements for profile ${hris_profile_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
