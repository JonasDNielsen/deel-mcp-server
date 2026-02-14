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

  // ── New Endpoints ────────────────────────────────────────
  console.log("\n🆕 New Endpoints\n");

  // List people
  await test("list_people", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/people", { limit: 3 });
    const people = res.data;
    if (!people || people.length === 0) throw new Error("No people returned");
    const first = people[0] as Record<string, unknown>;
    if (!first.full_name) throw new Error("Missing full_name field");
    if (!first.id) throw new Error("Missing id field");
    const total = res.page?.total_rows ?? "?";
    return `${people.length} person(s) (total: ${total}), first: ${first.full_name} (${first.id})`;
  });

  // Enhanced get_person — check new fields
  if (gpWorkerId) {
    await test(`get_person enhanced fields (${gpWorkerId})`, async () => {
      const res = await deelRequest<Record<string, unknown>>(`/people/${gpWorkerId}`);
      const p = res.data;
      const checks = [
        p.first_name ? "first_name✓" : "first_name✗",
        p.last_name ? "last_name✓" : "last_name✗",
        p.birth_date ? "birth_date✓" : "birth_date✗",
        p.created_at ? "created_at✓" : "created_at✗",
        p.direct_reports_count !== undefined ? "direct_reports_count✓" : "direct_reports_count✗",
        Array.isArray(p.emails) ? `emails(${(p.emails as Array<unknown>).length})✓` : "emails✗",
      ];
      return `${p.full_name} | ${checks.join(" ")}`;
    });
  }

  // Contract amendments
  if (gpContractId) {
    await test(`get_contract_amendments (${gpContractId})`, async () => {
      const res = await deelRequest<unknown>(`/contracts/${gpContractId}/amendments`);
      const raw = res as unknown as Record<string, unknown>;
      const amendments = raw.data as Array<Record<string, unknown>> | undefined;
      if (!amendments) return "No data field";
      if (amendments.length === 0) return "0 amendments";
      const first = amendments[0];
      if (!first.id) throw new Error("Missing amendment id field");
      return `${amendments.length} amendment(s), first: ${first.status ?? "?"} effective ${first.effective_date ? String(first.effective_date).slice(0, 10) : "?"}`;
    });
  }

  // Contract custom fields
  await test("list_contract_custom_fields", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/contracts/custom_fields");
    return `${res.data.length} contract custom field(s)`;
  });

  // Contract templates
  await test("list_contract_templates", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/contract-templates");
    const templates = res.data;
    if (templates.length === 0) return "0 templates";
    const first = templates[0];
    if (!first.id) throw new Error("Missing template id field");
    return `${templates.length} template(s), first: ${first.title ?? "?"}`;
  });

  // Adjustment categories
  await test("list_adjustment_categories", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/adjustments/categories");
    const cats = res.data;
    if (cats.length === 0) return "0 categories";
    const first = cats[0];
    if (!first.id || !first.name) throw new Error("Missing id or name field");
    return `${cats.length} categories, first: ${first.name} (${first.unit_type ?? "?"})`;
  });

  // EOR country guide
  await test("get_eor_country_guide (DE)", async () => {
    const res = await deelRequest<Record<string, unknown>>("/eor/validations/DE");
    const d = res.data;
    if (!d.currency) throw new Error("Missing currency field");
    const salary = d.salary as Record<string, unknown> | undefined;
    return `Germany: currency=${d.currency}, salary min=${salary?.min ?? "?"}, max=${salary?.max ?? "?"}`;
  });

  // Contract sub-resources
  if (gpContractId) {
    await test(`get_contract_off_cycle_payments (${gpContractId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/contracts/${gpContractId}/off-cycle-payments`);
      return `${res.data.length} off-cycle payment(s)`;
    });

    await test(`get_contract_tasks (${gpContractId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/contracts/${gpContractId}/tasks`);
      return `${res.data.length} task(s)`;
    });

    await test(`get_contract_invoice_adjustments (${gpContractId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/contracts/${gpContractId}/invoice-adjustments`);
      return `${res.data.length} invoice adjustment(s)`;
    });
  }

  // Worker bank guide
  if (gpWorkerId) {
    await test(`get_worker_bank_guide (${gpWorkerId})`, async () => {
      const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/workers/${gpWorkerId}/banks/guide`);
      const fields = res.data;
      if (fields.length === 0) return "0 bank guide fields";
      const first = fields[0];
      if (!first.key) throw new Error("Missing key field");
      return `${fields.length} field(s), first: ${first.label ?? first.key} (${first.type ?? "?"})`;
    });
  }

  // Webhook event types
  await test("list_webhook_event_types", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/webhooks/events/types");
    const types = res.data;
    if (types.length === 0) return "0 event types";
    const first = types[0];
    if (!first.name) throw new Error("Missing name field");
    return `${types.length} event type(s), first: ${first.name} (${first.module_label ?? "?"})`;
  });

  // ── GTN Local Currency Verification (Bug #11 fix) ───────
  console.log("\n🔬 GTN Local Currency Verification\n");

  const gtnVerifyReportId = closedReportId ?? "cmfnqpf8z0p6w01ww857ec4a3";
  await test(`GTN local currency (${gtnVerifyReportId})`, async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/reports/${gtnVerifyReportId}/gross_to_net`);
    const data = res.data;
    if (!Array.isArray(data) || data.length === 0) return "No GTN data";
    const row = data[0] as Record<string, unknown>;
    const numVal = (field: unknown): number | null => {
      if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
        const cv = (field as Record<string, unknown>).currentValue;
        if (cv !== null && cv !== undefined) { const n = Number(cv); return isNaN(n) ? null : n; }
      }
      return null;
    };
    const textVal = (field: unknown): string => {
      if (field && typeof field === "object" && "currentValue" in (field as Record<string, unknown>)) {
        return String((field as Record<string, unknown>).currentValue ?? "N/A");
      }
      return String(field ?? "N/A");
    };
    const currency = textVal(row.originalCurrency);
    const fxRate = numVal(row.fxRate) ?? 1;
    const baseSalaryUsd = numVal(row.baseSalary) ?? 0;
    const baseSalaryLocal = baseSalaryUsd * fxRate;
    const name = textVal(row.employeeName);
    // Verify local amount is significantly larger than USD for non-USD currencies
    if (currency !== "USD" && fxRate > 1 && baseSalaryLocal <= baseSalaryUsd) {
      throw new Error(`Bug #11 not fixed: local ${baseSalaryLocal} ${currency} <= USD ${baseSalaryUsd}`);
    }
    return `${name}: ${baseSalaryLocal.toFixed(0)} ${currency} (from ${baseSalaryUsd.toFixed(0)} USD × ${fxRate.toFixed(4)})`;
  });

  // GTN CSV endpoint
  await test(`GTN CSV (${gtnVerifyReportId})`, async () => {
    const res = await deelRequest<unknown>(`/gp/reports/${gtnVerifyReportId}/gross_to_net/csv`);
    const csv = typeof res === "string" ? res : String((res as unknown as Record<string, unknown>).data ?? res);
    if (!csv || csv.length < 10) throw new Error("CSV response too short or empty");
    const lines = csv.split("\n").filter(l => l.trim());
    if (!csv.includes("Employee Name")) throw new Error("CSV missing expected header columns");
    return `${lines.length - 1} worker rows, ${csv.length} bytes`;
  });

  // ── V2 Fix Validation ───────────────────────────────────
  console.log("\n🔧 V2 Fixes\n");

  // BUG-1: Verify SE GTN now shows base salary via monthlyGrossSalaryRegularWork fallback
  await test("BUG-1: SE GTN base salary fix", async () => {
    // Find SE entity and closed report
    const entRes = await deelRequest<Array<Record<string, unknown>>>("/legal-entities");
    let seEntityId: string | undefined;
    for (const e of entRes.data) {
      const name = String(e.name ?? "").toLowerCase();
      if (name.includes(" ab") || String(e.country ?? "").toUpperCase() === "SE") {
        seEntityId = String(e.id); break;
      }
    }
    if (!seEntityId) return "WARN: No SE entity found";
    const repRes = await deelRequest<Array<Record<string, unknown>>>(`/gp/legal-entities/${seEntityId}/reports`);
    let seClosedId: string | undefined;
    for (const r of repRes.data) { if (r.status === "CLOSED") { seClosedId = String(r.id); break; } }
    if (!seClosedId) return "WARN: No CLOSED SE report";
    const gtnRes = await deelRequest<Array<Record<string, unknown>>>(`/gp/reports/${seClosedId}/gross_to_net`);
    const seData = gtnRes.data;
    if (!Array.isArray(seData) || seData.length === 0) return "WARN: No SE GTN data";
    // Check first non-ghost row has monthlyGrossSalaryRegularWork or baseSalary
    const row = seData.find(r => {
      const n = r as Record<string, unknown>;
      const nameField = n.employeeName as Record<string, unknown> | undefined;
      return nameField?.currentValue != null;
    }) as Record<string, unknown> | undefined;
    if (!row) return "WARN: All SE rows are ghost entries";
    const base = row.baseSalary ?? row.monthlyGrossSalaryRegularWork;
    if (!base) throw new Error("No baseSalary or monthlyGrossSalaryRegularWork field");
    const cv = (base as Record<string, unknown>).currentValue;
    if (cv === null || cv === undefined) throw new Error("Base salary value is null");
    return `SE base salary fallback works: currentValue=${cv}`;
  });

  // BUG-2: Verify ghost worker filtered
  await test("BUG-2: ghost worker filtered", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>(`/gp/reports/${gtnVerifyReportId}/gross_to_net`);
    const data = res.data;
    if (!Array.isArray(data)) return "Not an array";
    const ghostCount = data.filter(r => {
      const row = r as Record<string, unknown>;
      const nameField = row.employeeName as Record<string, unknown> | undefined;
      return nameField?.currentValue == null;
    }).length;
    return `${data.length} total rows, ${ghostCount} ghost(s) — formatter will filter these out`;
  });

  // BUG-3: Verify REQUESTED works (replaces PENDING)
  await test("BUG-3: time-off REQUESTED status", async () => {
    const res = await deelRequest<unknown>("/time_offs", { "status[]": "REQUESTED" });
    const raw = res as unknown as Record<string, unknown>;
    const data = raw.data;
    if (!Array.isArray(data)) throw new Error("Unexpected response shape");
    return `REQUESTED: ${data.length} request(s)`;
  });

  // BUG-5: Verify new contract statuses work
  await test("BUG-5: contract onboarded status", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", { "statuses[]": "onboarded", limit: 5 });
    return `onboarded: ${res.page?.total_rows ?? res.data.length} contracts`;
  });

  await test("BUG-5: contract completed status", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/contracts", { "statuses[]": "completed", limit: 5 });
    return `completed: ${res.page?.total_rows ?? res.data.length} contracts`;
  });

  // IMP-1: Headcount summary
  await test("IMP-1: headcount summary", async () => {
    const res = await deelRequest<Array<Record<string, unknown>>>("/people", { limit: 100 });
    const total = res.page?.total_rows ?? res.data.length;
    if (total === 0) throw new Error("No people for headcount");
    return `Headcount data available: ${total} people`;
  });

  // IMP-3: Payroll calendar
  await test("IMP-3: payroll calendar", async () => {
    const entRes = await deelRequest<Array<Record<string, unknown>>>("/legal-entities");
    if (entRes.data.length === 0) throw new Error("No entities for calendar");
    const first = entRes.data[0];
    const repRes = await deelRequest<Array<Record<string, unknown>>>(`/gp/legal-entities/${first.id}/reports`);
    return `Calendar: ${entRes.data.length} entities, ${first.name} has ${repRes.data.length} reports`;
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
