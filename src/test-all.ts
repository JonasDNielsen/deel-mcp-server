#!/usr/bin/env node
/**
 * Comprehensive Deel MCP endpoint test script.
 *
 * Usage:
 *   DEEL_API_TOKEN="your-token" node build/test-all.js
 *
 * Runs every endpoint the MCP server exposes and reports PASS/FAIL/WARN.
 * For endpoints that depend on data (contract IDs, worker IDs, etc.),
 * it discovers them from earlier calls automatically.
 */
import { deelRequest } from "./client.js";

let pass = 0;
let fail = 0;
let warn = 0;

async function test(label: string, fn: () => Promise<string>) {
  const num = pass + fail + warn + 1;
  try {
    const result = await fn();
    pass++;
    console.log(`  ✅ #${num} ${label}: ${result}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("WARN:")) {
      warn++;
      console.log(`  ⚠️  #${num} ${label}: ${msg}`);
    } else {
      fail++;
      console.log(`  ❌ #${num} ${label}: ${msg}`);
    }
  }
}

async function main() {
  console.log("\n🧪 Deel MCP Server — Full Endpoint Test\n");
  console.log("=".repeat(60));

  // ── Organization & Structure ──────────────────────────────
  console.log("\n📋 Organization & Structure\n");

  let legalEntityId: string | undefined;

  await test("get_organization", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/organizations");
    const orgs = res.data;
    if (!orgs || orgs.length === 0) throw new Error("No organization data");
    const org = orgs[0]!;
    if (!org.name) throw new Error("Missing org name");
    return `${org.name} (${org.id})`;
  });

  await test("list_legal_entities", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/legal-entities");
    const entities = res.data;
    if (!entities || entities.length === 0) throw new Error("No legal entities");
    legalEntityId = String(entities[0].id);
    return `${entities.length} entities, first: ${entities[0].name} (${legalEntityId})`;
  });

  await test("list_teams", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/teams");
    return `${res.data.length} team(s)`;
  });

  await test("list_departments", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/departments");
    return `${res.data.length} department(s)`;
  });

  await test("list_managers", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/managers");
    return `${res.data.length} manager(s)`;
  });

  await test("list_people_custom_fields", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/people/custom_fields");
    return `${res.data.length} custom field(s)`;
  });

  // ── Contracts ─────────────────────────────────────────────
  console.log("\n📄 Contracts\n");

  let gpContractId: string | undefined;
  let paygContractId: string | undefined;
  let gpWorkerId: string | undefined;

  await test("list_contracts (no filter)", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", { limit: 99 });
    const contracts = res.data;
    if (!contracts || contracts.length === 0) throw new Error("No contracts");
    // Collect IDs for later tests
    for (const c of contracts) {
      if (c.type === "global_payroll" && !gpContractId) {
        gpContractId = String(c.id);
        const w = c.worker as Record<string, unknown> | null;
        if (w?.id) gpWorkerId = String(w.id);
      }
      if (String(c.type).startsWith("pay_as_you_go") && !paygContractId) {
        paygContractId = String(c.id);
      }
    }
    return `${contracts.length} contracts, total: ${res.page?.total_rows ?? "?"}`;
  });

  // Test contract type filter with known types
  const contractTypes = ["global_payroll", "hris_direct_employee", "pay_as_you_go_time_based"];
  for (const ct of contractTypes) {
    await test(`list_contracts (types[]=${ct})`, async () => {
      try {
        const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", { "types[]": ct, limit: 1 });
        return `${res.page?.total_rows ?? res.data.length} contracts`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("400")) throw new Error(`WARN: type "${ct}" rejected by API — ${msg}`);
        throw e;
      }
    });
  }

  // Need a GP contract for further tests; fetch more if needed
  if (!gpContractId) {
    await test("list_contracts (find GP contract)", async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", { "types[]": "global_payroll", limit: 1 });
      if (res.data.length > 0) {
        gpContractId = String(res.data[0].id);
        return `Found GP contract ${gpContractId}`;
      }
      throw new Error("WARN: No GP contracts in this org");
    });
  }

  // Get worker ID from contract detail (list view has worker=null for GP)
  if (gpContractId && !gpWorkerId) {
    await test(`get_contract (${gpContractId}) + discover worker ID`, async () => {
      const res = await deelRequest<Record<string, unknown>>(`/contracts/${gpContractId}`);
      const c = res.data;
      const worker = c.worker as Record<string, unknown> | null;
      if (worker?.id) gpWorkerId = String(worker.id);
      const comp = c.compensation_details as Record<string, unknown> | undefined;
      const compInfo = comp ? `${comp.amount} ${comp.currency_code} ${comp.scale}` : "no comp";
      return `${c.title} | ${compInfo} | worker: ${gpWorkerId ?? "none"}`;
    });
  } else if (gpContractId) {
    await test(`get_contract (${gpContractId})`, async () => {
      const res = await deelRequest<Record<string, unknown>>(`/contracts/${gpContractId}`);
      const c = res.data;
      const comp = c.compensation_details as Record<string, unknown> | undefined;
      if (comp) return `${c.title} | ${comp.amount} ${comp.currency_code} ${comp.scale}`;
      return `${c.title} | No compensation_details (may be normal for type: ${c.type})`;
    });
  }

  if (gpContractId) {
    await test(`get_contract_adjustments (${gpContractId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/contracts/${gpContractId}/adjustments`);
      return `${res.data.length} adjustment(s)`;
    });
  }

  if (paygContractId) {
    await test(`get_contract_timesheets (${paygContractId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/contracts/${paygContractId}/timesheets`);
      return `${res.data.length} timesheet(s)`;
    });
  }

  // ── People & Workers ──────────────────────────────────────
  console.log("\n👤 People & Workers\n");

  if (gpWorkerId) {
    await test(`get_person (${gpWorkerId})`, async () => {
      const res = await deelRequest<Record<string, unknown>>(`/people/${gpWorkerId}`);
      const p = res.data;
      const emails = p.emails as Array<Record<string, string>> | undefined;
      const workEmail = emails?.find(e => e.type === "work")?.value ?? emails?.[0]?.value;
      const dept = p.department as Record<string, unknown> | undefined;
      const manager = p.direct_manager as Record<string, unknown> | undefined;
      const checks = [
        p.full_name ? "name✓" : "name✗",
        workEmail ? "email✓" : "email✗",
        p.hiring_status ? "status✓" : "status✗",
        p.start_date ? "start_date✓" : "start_date✗",
        dept?.name ? "dept✓" : "dept✗",
        p.seniority ? "seniority✓" : "seniority✗",
        manager?.display_name ? "manager✓" : "manager✗",
      ];
      return `${p.full_name} | ${checks.join(" ")}`;
    });

    await test(`get_worker_payslips (${gpWorkerId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/workers/${gpWorkerId}/payslips`);
      return `${res.data.length} payslip(s)`;
    });

    await test(`get_worker_banks (${gpWorkerId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/workers/${gpWorkerId}/banks`);
      return `${res.data.length} bank account(s)`;
    });

    await test(`list_worker_documents (${gpWorkerId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/workers/${gpWorkerId}/documents`);
      return `${res.data.length} document(s)`;
    });

    await test(`get_time_off_entitlements (${gpWorkerId})`, async () => {
      const res = await deelRequest<unknown>(`/time_offs/profile/${gpWorkerId}/entitlements`);
      const raw = res as unknown as Record<string, unknown>;
      const dataObj = raw.data as Record<string, unknown> | undefined;
      const entitlements = dataObj?.entitlements ?? raw.entitlements;
      if (!Array.isArray(entitlements)) {
        throw new Error(`Unexpected shape. Keys: [${Object.keys(raw).join(", ")}], data keys: [${dataObj ? Object.keys(dataObj).join(", ") : "none"}]`);
      }
      if (entitlements.length > 0) {
        const e = entitlements[0] as Record<string, unknown>;
        const policy = e.policy as Record<string, unknown> | undefined;
        return `${entitlements.length} entitlement(s), first: ${policy?.name ?? "?"} = ${e.available ?? "?"} avail`;
      }
      return "0 entitlements";
    });
  } else {
    console.log("  ⏭️  Skipping People & Worker tests (no GP worker ID found)\n");
  }

  // ── Payroll & Payments ────────────────────────────────────
  console.log("\n💰 Payroll & Payments\n");

  let closedReportId: string | undefined;

  if (legalEntityId) {
    await test(`get_payroll_reports (${legalEntityId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/legal-entities/${legalEntityId}/reports`);
      const reports = res.data;
      for (const r of reports) {
        if (r.status === "CLOSED" && !closedReportId) closedReportId = String(r.id);
      }
      const startDate = reports[0]?.start_date ? String(reports[0].start_date).slice(0, 10) : "?";
      const endDate = reports[0]?.end_date ? String(reports[0].end_date).slice(0, 10) : "?";
      return `${reports.length} report(s), first period: ${startDate} to ${endDate}`;
    });
  }

  if (closedReportId) {
    await test(`get_gross_to_net (${closedReportId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/reports/${closedReportId}/gross_to_net`);
      const data = res.data;
      if (!Array.isArray(data) || data.length === 0) return "No G2N data (report may not be CLOSED)";
      const row = data[0] as Record<string, unknown>;
      const val = (field: unknown): string => {
        if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
          return String((field as Record<string, unknown>).currentValue ?? "N/A");
        }
        return String(field ?? "N/A");
      };
      const name = val(row.employeeName);
      const net = val(row.netPay);
      return `${data.length} worker(s), first: ${name}, net: ${net}`;
    });
  }

  await test("list_invoices", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/invoices", { limit: 3 });
    return `${res.data.length} invoice(s)`;
  });

  await test("list_deel_invoices", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/invoices/deel", { limit: 3 });
    return `${res.data.length} Deel fee invoice(s)`;
  });

  let firstPaymentId: string | undefined;
  await test("list_payments", async () => {
    const res = await deelRequest<Record<string, unknown>>("/payments", { limit: 3 });
    const wrapper = res.data;
    const rows = (wrapper.rows ?? []) as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      firstPaymentId = String(rows[0].id);
      const hasId = rows[0].id ? "id✓" : "id✗";
      const hasLabel = rows[0].label ? "label✓" : "label✗";
      return `${rows.length} payment(s) | ${hasId} ${hasLabel} | first ID: ${firstPaymentId}`;
    }
    return "0 payments";
  });

  if (firstPaymentId) {
    await test(`get_payment_breakdown (${firstPaymentId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/payments/${firstPaymentId}/breakdown`);
      const items = res.data;
      if (!Array.isArray(items) || items.length === 0) return "No breakdown items";
      const first = items[0];
      const name = first.contractor_employee_name ?? "?";
      const total = first.total ?? "?";
      const cur = first.currency ?? "";
      // Check for non-zero components
      const componentKeys = ["work", "bonus", "expenses", "commissions", "deductions", "overtime", "pro_rata", "others", "processing_fee", "adjustment"];
      const nonZero = componentKeys.filter(k => first[k] && first[k] !== "0.00" && first[k] !== "0");
      return `${items.length} item(s), first: ${name} = ${total} ${cur} | components: [${nonZero.join(", ")}]`;
    });
  }

  // ── Time Off ──────────────────────────────────────────────
  console.log("\n🏖️  Time Off\n");

  await test("list_time_off_requests", async () => {
    const res = await deelRequest<unknown>("/time_offs");
    const raw = res as unknown as Record<string, unknown>;
    const data = raw.data;
    if (!Array.isArray(data)) throw new Error(`Unexpected shape: ${typeof data}`);
    if (data.length > 0) {
      const r = data[0] as Record<string, unknown>;
      const rp = r.recipient_profile as Record<string, unknown> | undefined;
      const workerEmail = rp?.work_email ?? rp?.hris_profile_id ?? "no-email";
      return `${data.length} request(s), first worker: ${workerEmail}`;
    }
    return "0 requests";
  });

  await test("list_time_off_requests (status[]=APPROVED)", async () => {
    const res = await deelRequest<unknown>("/time_offs", { "status[]": "APPROVED" });
    const raw = res as unknown as Record<string, unknown>;
    const data = raw.data;
    if (!Array.isArray(data)) throw new Error(`Unexpected shape: ${typeof data}`);
    return `${data.length} APPROVED request(s)`;
  });

  // ── Lookups ───────────────────────────────────────────────
  console.log("\n📚 Lookups\n");

  await test("lookup_countries", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/countries");
    return `${res.data.length} countries`;
  });

  await test("lookup_currencies", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/currencies");
    return `${res.data.length} currencies`;
  });

  let jobTitlesCursor: string | undefined;
  let page1FirstTitle: string | undefined;

  await test("lookup_job_titles (page 1)", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/job-titles");
    page1FirstTitle = String(res.data[0]?.name ?? "");
    jobTitlesCursor = res.page?.cursor;
    return `${res.data.length} titles, first: "${page1FirstTitle}", cursor: ${jobTitlesCursor ? "present" : "missing"}`;
  });

  if (jobTitlesCursor) {
    await test("lookup_job_titles (page 2 via cursor)", async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/job-titles", { cursor: jobTitlesCursor });
      const page2FirstTitle = String(res.data[0]?.name ?? "");
      if (page2FirstTitle === page1FirstTitle) {
        throw new Error(`Page 2 returned same data as page 1 (first title: "${page2FirstTitle}")`);
      }
      return `${res.data.length} titles, first: "${page2FirstTitle}" (DIFFERENT from page 1 ✓)`;
    });
  }

  await test("lookup_seniorities", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/lookups/seniorities");
    return `${res.data.length} seniority levels`;
  });

  await test("lookup_time_off_types", async () => {
    const res = await deelRequest<Array<string>>("/lookups/time-off-types");
    const types = res.data;
    if (types.length === 0) throw new Error("No types returned");
    const sample = types.slice(0, 4).map(t => typeof t === "string" ? t : JSON.stringify(t)).join(", ");
    return `${types.length} types: ${sample}`;
  });

  // ── Summary ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${pass} passed, ${fail} failed, ${warn} warnings`);
  console.log(`   Total: ${pass + fail + warn} tests\n`);

  if (fail > 0) {
    console.log("❌ Some tests FAILED — review output above.\n");
    process.exit(1);
  } else if (warn > 0) {
    console.log("⚠️  All tests passed, but some warnings to review.\n");
  } else {
    console.log("✅ All tests passed!\n");
  }
}

main().catch(e => {
  console.error("\n💥 Fatal error:", e);
  process.exit(1);
});
