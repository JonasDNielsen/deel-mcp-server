#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerOrganizationTools } from "./tools/organization.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerContractTools } from "./tools/contracts.js";
import { registerPayrollTools } from "./tools/payroll.js";
import { registerInvoicePaymentTools } from "./tools/invoices-payments.js";
import { registerTimeOffTools } from "./tools/time-off.js";
import { registerTeamsDepartmentsTools } from "./tools/teams-departments.js";
import { registerBenefitsTools } from "./tools/benefits.js";
import { registerDocumentsTools } from "./tools/documents.js";
import { registerLookupTools } from "./tools/lookups.js";

const server = new McpServer({
  name: "deel",
  version: "1.0.0",
});

registerOrganizationTools(server);
registerPeopleTools(server);
registerContractTools(server);
registerPayrollTools(server);
registerInvoicePaymentTools(server);
registerTimeOffTools(server);
registerTeamsDepartmentsTools(server);
registerBenefitsTools(server);
registerDocumentsTools(server);
registerLookupTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Deel MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
