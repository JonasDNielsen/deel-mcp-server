import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deelRequest } from "../client.js";
import { success, error } from "../types.js";

async function fetchAllPeople(): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await deelRequest<Array<Record<string, unknown>>>("/people", { limit, offset });
    all.push(...res.data);
    const total = res.page?.total_rows ?? res.data.length;
    if (all.length >= total || res.data.length < limit) break;
    offset += limit;
  }
  return all;
}

export function registerPeopleTools(server: McpServer): void {
  server.tool(
    "deel_list_people",
    "List all people (workers/employees) in the organization. Returns name, email, country, hiring status, job title, department, and more for each person. Supports offset-based pagination and filtering by hiring status.",
    {
      hiring_status: z.string().optional().describe("Filter by hiring status (e.g. 'active', 'inactive', 'onboarding')"),
      hiring_type: z.string().optional().describe("Filter by hiring type (e.g. 'direct_employee', 'contractor')"),
      limit: z.number().min(1).max(100).optional().describe("Results per page (max 100)"),
      offset: z.number().min(0).optional().describe("Offset for pagination (default 0)"),
    },
    async ({ hiring_status, hiring_type, limit, offset }) => {
      try {
        const params: Record<string, string | number | undefined> = {};
        if (hiring_status) params["hiring_status[]"] = hiring_status;
        if (hiring_type) params["hiring_type[]"] = hiring_type;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;

        const res = await deelRequest<Array<Record<string, unknown>>>("/people", params);
        const people = res.data;
        if (!people || people.length === 0) {
          return success("No people found.");
        }

        const totalRows = res.page?.total_rows;
        let output = `Found ${people.length} person(s)${totalRows ? ` (total: ${totalRows})` : ""}:\n\n`;
        for (const p of people) {
          const emails = p.emails as Array<Record<string, string>> | undefined;
          const workEmail = emails?.find(e => e.type === "work")?.value
            ?? emails?.find(e => e.type === "primary")?.value
            ?? emails?.[0]?.value
            ?? "N/A";
          const dept = p.department as Record<string, unknown> | undefined;

          output += `- ${p.full_name ?? "N/A"} (ID: ${p.id})\n`;
          output += `  Email: ${workEmail} | Country: ${p.country ?? "N/A"}\n`;
          output += `  Status: ${p.hiring_status ?? "N/A"} | Type: ${p.hiring_type ?? "N/A"}\n`;
          output += `  Job Title: ${p.job_title ?? "N/A"} | Dept: ${dept?.name ?? "N/A"}\n`;
          if (p.start_date) output += `  Start Date: ${p.start_date}\n`;
          output += "\n";
        }

        if (totalRows && people.length < totalRows) {
          const currentOffset = offset ?? 0;
          output += `[More results — use offset: ${currentOffset + people.length} | Total: ${totalRows}]`;
        }
        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_person",
    "Get detailed information about a specific worker/employee by their ID, including personal details, birth date, nationality, emails, employment type, compensation, direct reports, and custom fields.",
    { worker_id: z.string().describe("The unique Deel worker/person ID") },
    async ({ worker_id }) => {
      try {
        const res = await deelRequest<Record<string, unknown>>(`/people/${worker_id}`);
        const p = res.data;

        // Extract all emails
        const emails = p.emails as Array<Record<string, string>> | undefined;
        let emailLines = "N/A";
        if (emails && emails.length > 0) {
          emailLines = emails.map(e => `${e.value} (${e.type})`).join(", ");
        }

        // Department
        const dept = p.department as Record<string, unknown> | undefined;

        // Direct manager
        const manager = p.direct_manager as Record<string, unknown> | undefined;
        const managerInfo = manager ? `${manager.display_name ?? "N/A"} (${manager.work_email ?? ""})` : "N/A";

        // Nationalities (array)
        const nationalities = p.nationalities as Array<string> | undefined;
        const nationalityStr = nationalities && nationalities.length > 0 ? nationalities.join(", ") : "N/A";

        // Client legal entity
        const legalEntity = p.client_legal_entity as Record<string, unknown> | undefined;

        const lines = [
          `Name: ${p.full_name ?? "N/A"} (First: ${p.first_name ?? "N/A"}, Last: ${p.last_name ?? "N/A"})`,
          `ID: ${p.id ?? worker_id}`,
          `Emails: ${emailLines}`,
          `Country: ${p.country ?? "N/A"}`,
          `Nationality: ${nationalityStr}`,
          `Birth Date: ${p.birth_date ?? "N/A"}`,
          `Hiring Type: ${p.hiring_type ?? "N/A"}`,
          `Hiring Status: ${p.hiring_status ?? "N/A"}`,
          `Start Date: ${p.start_date ?? "N/A"}`,
          `Job Title: ${p.job_title ?? "N/A"}`,
          `Department: ${dept?.name ?? "N/A"}`,
          `Seniority: ${p.seniority ?? "N/A"}`,
          `Manager: ${managerInfo}`,
          `Direct Reports: ${p.direct_reports_count ?? 0}`,
        ];

        if (legalEntity) {
          lines.push(`Legal Entity: ${legalEntity.name ?? "N/A"} (${legalEntity.id ?? "N/A"})`);
        }
        if (p.timezone) lines.push(`Timezone: ${p.timezone}`);
        if (p.completion_date) lines.push(`Completion Date: ${p.completion_date}`);
        if (p.termination_last_day) lines.push(`Termination Last Day: ${p.termination_last_day}`);
        if (p.created_at) lines.push(`Created: ${String(p.created_at).slice(0, 10)}`);
        if (p.preferred_first_name || p.preferred_last_name) {
          lines.push(`Preferred Name: ${p.preferred_first_name ?? ""} ${p.preferred_last_name ?? ""}`.trim());
        }

        // Compensation from employments
        const employments = p.employments as Array<Record<string, unknown>> | undefined;
        if (employments && employments.length > 0) {
          const emp = employments[0];
          const payment = emp.payment as Record<string, unknown> | undefined;
          if (payment) {
            const rate = payment.rate !== undefined && payment.rate !== null ? Number(payment.rate) : null;
            const fmtRate = rate !== null && !isNaN(rate) ? rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A";
            const scaleMap: Record<string, string> = { monthly: "month", hourly: "hour", weekly: "week", yearly: "year", annually: "year", biweekly: "2 weeks" };
            const rawScale = String(payment.scale ?? "N/A").toLowerCase();
            const scale = scaleMap[rawScale] ?? rawScale;
            lines.push(`Compensation: ${fmtRate} ${payment.currency ?? ""} per ${scale}`);
          }
        }

        // Custom fields
        const customFields = p.custom_fields as Array<Record<string, unknown>> | undefined;
        if (customFields && customFields.length > 0) {
          lines.push(`\nCustom Fields:`);
          for (const cf of customFields) {
            lines.push(`  ${cf.label ?? cf.name ?? "Field"}: ${cf.value ?? "N/A"}`);
          }
        }

        return success(lines.join("\n"));
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_headcount_summary",
    "Get a headcount summary for the organization, broken down by country, department, hiring status, and hiring type. Pulls all people and aggregates the counts.",
    {},
    async () => {
      try {
        const allPeople = await fetchAllPeople();
        if (allPeople.length === 0) return success("No people found in organization.");

        const byCountry: Record<string, number> = {};
        const byDept: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        const byType: Record<string, number> = {};

        for (const p of allPeople) {
          const country = String(p.country ?? "Unknown");
          byCountry[country] = (byCountry[country] ?? 0) + 1;

          const dept = (p.department as Record<string, unknown> | undefined)?.name ?? "None";
          byDept[String(dept)] = (byDept[String(dept)] ?? 0) + 1;

          const status = String(p.hiring_status ?? "Unknown");
          byStatus[status] = (byStatus[status] ?? 0) + 1;

          const type = String(p.hiring_type ?? "Unknown");
          byType[type] = (byType[type] ?? 0) + 1;
        }

        const sortDesc = (obj: Record<string, number>) =>
          Object.entries(obj).sort((a, b) => b[1] - a[1]);

        let output = `Headcount Summary: ${allPeople.length} total\n\n`;

        output += `By Status:\n`;
        for (const [k, v] of sortDesc(byStatus)) output += `  ${k}: ${v}\n`;

        output += `\nBy Country:\n`;
        for (const [k, v] of sortDesc(byCountry)) output += `  ${k}: ${v}\n`;

        output += `\nBy Department:\n`;
        for (const [k, v] of sortDesc(byDept)) output += `  ${k}: ${v}\n`;

        output += `\nBy Hiring Type:\n`;
        for (const [k, v] of sortDesc(byType)) output += `  ${k}: ${v}\n`;

        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_list_people_custom_fields",
    "Fetch custom fields defined for people in the organization.",
    {},
    async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/people/custom_fields");
        const fields = res.data;
        if (!fields || fields.length === 0) {
          return success("No custom fields defined for people.");
        }
        let output = `Found ${fields.length} custom field(s):\n\n`;
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
    "deel_get_org_chart",
    "Build the full organizational reporting hierarchy showing who reports to whom. Fetches all active people and renders a tree based on manager relationships. Useful for understanding org structure, reporting lines, and span of control.",
    {},
    async () => {
      try {
        const allPeople = await fetchAllPeople();
        if (allPeople.length === 0) return success("No people found in organization.");

        // Separate active vs inactive
        const activePeople = allPeople.filter(p => p.hiring_status === "active");
        const inactiveCount = allPeople.length - activePeople.length;

        if (activePeople.length === 0) return success("No active people found in organization.");

        // Build lookup: id → person
        const byId = new Map<string, Record<string, unknown>>();
        for (const p of activePeople) {
          byId.set(String(p.id), p);
        }

        // Build children map: managerId → [person, ...]
        const children = new Map<string, Array<Record<string, unknown>>>();
        const roots: Array<Record<string, unknown>> = [];

        for (const p of activePeople) {
          const manager = p.direct_manager as Record<string, unknown> | undefined;
          const managerId = manager?.id ? String(manager.id) : null;

          if (!managerId || !byId.has(managerId)) {
            roots.push(p);
          } else {
            if (!children.has(managerId)) children.set(managerId, []);
            children.get(managerId)!.push(p);
          }
        }

        // Sort roots and children by name
        const sortByName = (a: Record<string, unknown>, b: Record<string, unknown>) =>
          String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""));
        roots.sort(sortByName);
        for (const [, list] of children) list.sort(sortByName);

        // Recursive render with cycle detection
        const visited = new Set<string>();
        const renderPerson = (p: Record<string, unknown>, depth: number): string => {
          const id = String(p.id);
          if (visited.has(id)) return "";
          visited.add(id);

          const indent = "  ".repeat(depth);
          const dept = (p.department as Record<string, unknown> | undefined)?.name ?? "No dept";
          let line = `${indent}${p.full_name ?? "N/A"} — ${p.job_title ?? "N/A"} (${dept})\n`;

          const reports = children.get(id);
          if (reports) {
            for (const r of reports) {
              line += renderPerson(r, depth + 1);
            }
          }
          return line;
        };

        // Separate roots: those with direct reports (tree tops) vs standalone
        const treeRoots = roots.filter(p => children.has(String(p.id)));
        const standalone = roots.filter(p => !children.has(String(p.id)));

        let output = `Org Chart (${activePeople.length} active people):\n\n`;

        // Render tree roots first
        for (const root of treeRoots) {
          output += renderPerson(root, 0);
          output += "\n";
        }

        // Then standalone (no manager, no reports)
        if (standalone.length > 0) {
          output += `No manager assigned (${standalone.length}):\n`;
          for (const p of standalone) {
            const dept = (p.department as Record<string, unknown> | undefined)?.name ?? "No dept";
            output += `  ${p.full_name ?? "N/A"} — ${p.job_title ?? "N/A"} (${dept})\n`;
          }
          output += "\n";
        }

        if (inactiveCount > 0) {
          output += `(${inactiveCount} inactive people excluded)\n`;
        }

        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "deel_get_cost_comparison",
    "Compare compensation costs between contractors and employees, broken down by hiring type and country. Shows headcount, total annual compensation, and average per person for each group. Useful for budget planning and workforce mix analysis.",
    {},
    async () => {
      try {
        const allPeople = await fetchAllPeople();
        const activePeople = allPeople.filter(p => p.hiring_status === "active");

        if (activePeople.length === 0) return success("No active people found in organization.");

        const scaleMap: Record<string, number> = {
          monthly: 12,
          hourly: 2080,
          weekly: 52,
          biweekly: 26,
          yearly: 1,
          annually: 1,
        };

        // Group: hiringType → country → currency → { count, total }
        type CostEntry = { count: number; total: number; currency: string };
        const groups = new Map<string, Map<string, CostEntry>>();
        let noCompCount = 0;

        for (const p of activePeople) {
          const hiringType = String(p.hiring_type ?? "unknown");
          const country = String(p.country ?? "Unknown");

          const employments = p.employments as Array<Record<string, unknown>> | undefined;
          const payment = (employments?.[0] as Record<string, unknown> | undefined)?.payment as Record<string, unknown> | undefined;

          if (!payment || payment.rate === undefined || payment.rate === null) {
            noCompCount++;
            continue;
          }

          const rate = Number(payment.rate);
          if (isNaN(rate) || rate === 0) {
            noCompCount++;
            continue;
          }

          const rawScale = String(payment.scale ?? "monthly").toLowerCase();
          const multiplier = scaleMap[rawScale] ?? 12;
          const annualCost = rate * multiplier;
          const currency = String(payment.currency ?? "N/A");

          const key = `${country}|${currency}`;

          if (!groups.has(hiringType)) groups.set(hiringType, new Map());
          const typeMap = groups.get(hiringType)!;

          if (!typeMap.has(key)) {
            typeMap.set(key, { count: 0, total: 0, currency });
          }
          const entry = typeMap.get(key)!;
          entry.count++;
          entry.total += annualCost;
        }

        // Sort hiring types: direct_employee first, then contractors, then others
        const typeOrder: Record<string, number> = { direct_employee: 0, eor_employee: 1, contractor: 2 };
        const sortedTypes = [...groups.entries()].sort((a, b) =>
          (typeOrder[a[0]] ?? 99) - (typeOrder[b[0]] ?? 99)
        );

        const fmtNum = (n: number, currency: string) =>
          `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

        let output = `Cost Comparison — ${activePeople.length} active people:\n\n`;

        for (const [hiringType, countryMap] of sortedTypes) {
          const typeLabel = hiringType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          const totalCount = [...countryMap.values()].reduce((s, e) => s + e.count, 0);
          output += `${typeLabel} (${totalCount} people):\n`;

          // Sort countries by count descending
          const sortedCountries = [...countryMap.entries()].sort((a, b) => b[1].count - a[1].count);
          for (const [key, entry] of sortedCountries) {
            const country = key.split("|")[0];
            const avg = entry.total / entry.count;
            output += `  ${country}: ${entry.count} people — ${fmtNum(entry.total, entry.currency)}/year (avg ${fmtNum(avg, entry.currency)})\n`;
          }
          output += "\n";
        }

        if (noCompCount > 0) {
          output += `${noCompCount} active people have no compensation data.\n\n`;
        }

        output += `Note: Amounts are base compensation. Use deel_get_gross_to_net for total employer cost including taxes/benefits.\n`;

        return success(output);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
