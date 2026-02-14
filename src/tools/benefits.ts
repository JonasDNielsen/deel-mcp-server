import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

export function registerBenefitsTools(server: McpServer): void {
  server.tool(
    "deel_get_eor_benefits",
    "Get benefits information for an EOR (Employer of Record) contract, including health, dental, and other benefits.",
    { contract_id: z.string().describe("The EOR contract ID") },
    async ({ contract_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown> | Array<Record<string, unknown>>>(
          `/eor/${contract_id}/benefits`
        );
        const data = res.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return success(`No benefits found for EOR contract ${contract_id}.`);
          }
          let output = `Benefits for EOR contract ${contract_id}:\n\n`;
          for (const b of data) {
            output += `- ${b.name ?? b.type ?? "Benefit"}: ${b.description ?? "N/A"}\n`;
            if (b.provider) output += `  Provider: ${b.provider}\n`;
            if (b.cost) output += `  Cost: ${b.cost} ${b.currency ?? ""}\n`;
          }
          return success(output);
        }
        return success(`Benefits for EOR contract ${contract_id}:\n${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_eor_country_guide",
    "Get EOR hiring compliance guide for a specific country, including salary ranges, holiday/sick day minimums, probation rules, work schedule requirements, and currency.",
    { country_code: z.string().describe("ISO 2-letter country code (e.g. 'DE', 'GB', 'BR', 'DK')") },
    async ({ country_code }) => {
      try {
        const res = await deelRequest<Record<string, unknown>>(`/eor/validations/${country_code.toUpperCase()}`);
        const d = res.data;

        let output = `EOR Hiring Guide for ${country_code.toUpperCase()}:\n\n`;
        output += `Currency: ${d.currency ?? "N/A"}\n`;
        if (d.hiring_guide_country_name) output += `Country: ${d.hiring_guide_country_name}\n`;
        if (d.start_date_buffer) output += `Start date buffer: ${d.start_date_buffer} days\n`;

        const salary = d.salary as Record<string, unknown> | undefined;
        if (salary) {
          output += `\nSalary:\n`;
          output += `  Min: ${salary.min ?? "N/A"} | Max: ${salary.max ?? "N/A"} | Frequency: ${salary.frequency ?? "N/A"}\n`;
        }

        const holiday = d.holiday as Record<string, unknown> | undefined;
        if (holiday) {
          output += `\nHoliday:\n`;
          output += `  Min: ${holiday.min ?? "N/A"} days | Max: ${holiday.max ?? "N/A"} | Most common: ${holiday.mostCommon ?? "N/A"}\n`;
        }

        const sickDays = d.sick_days as Record<string, unknown> | undefined;
        if (sickDays) {
          output += `Sick days: Min ${sickDays.min ?? "N/A"} | Max ${sickDays.max ?? "N/A"}\n`;
        }

        const probation = d.probation as Record<string, unknown> | undefined;
        if (probation) {
          output += `\nProbation:\n`;
          output += `  Min: ${probation.min ?? 0} | Max: ${probation.max ?? "N/A"} ${probation.timeUnit ?? "days"}\n`;
        }

        const workSchedule = d.work_schedule as Record<string, unknown> | undefined;
        if (workSchedule) {
          const days = workSchedule.days as Record<string, unknown> | undefined;
          const hours = workSchedule.hours as Record<string, unknown> | undefined;
          output += `\nWork schedule:\n`;
          if (days) output += `  Days/week: min ${days.min ?? "N/A"}, max ${days.max ?? "N/A"}\n`;
          if (hours) output += `  Hours/day: min ${hours.min ?? "N/A"}, max ${hours.max ?? "N/A"}\n`;
        }

        const definiteContract = d.definite_contract as Record<string, unknown> | undefined;
        if (definiteContract) {
          output += `\nDefinite contract: ${definiteContract.type ?? "N/A"}\n`;
        }

        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
