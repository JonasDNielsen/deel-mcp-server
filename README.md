# Deel MCP Server

An MCP (Model Context Protocol) server that provides read-only access to your [Deel](https://www.deel.com/) HR and payroll data through Claude.

## What it does

Query your Deel organization data using natural language through Claude:

- **Organization** — company details, legal entities
- **People** — employee/worker profiles, custom fields
- **Contracts** — all contract types, adjustments, timesheets
- **Payroll** — reports, gross-to-net calculations, payslips, bank accounts
- **Invoices & Payments** — salary invoices, Deel fees, payment breakdowns
- **Time Off** — requests, entitlements
- **Teams & Departments** — org structure, managers
- **Benefits** — EOR benefits
- **Documents** — worker document metadata
- **Lookups** — countries, currencies, job titles, seniorities, time-off types

**25 read-only tools** — no write operations, safe for querying.

## Setup

### 1. Get a Deel API Token

1. Log into [Deel](https://app.letsdeel.com/)
2. Go to **More → Developer → Access Tokens**
3. Generate an **Organization Token** with read scopes for the resources you need (e.g. `contracts:read`, `people:read`)
4. Copy the token immediately — it won't be shown again

### 2. Install & Build

```bash
git clone https://github.com/YOUR_USERNAME/deel-mcp-server.git
cd deel-mcp-server
npm install
npm run build
```

### 3. Configure with Claude

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deel": {
      "command": "node",
      "args": ["/absolute/path/to/deel-mcp-server/build/index.js"],
      "env": {
        "DEEL_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Claude Code** — add via CLI:

```bash
claude mcp add deel -- node /absolute/path/to/deel-mcp-server/build/index.js
```

Set the environment variable before running:

```bash
export DEEL_API_TOKEN=your_token_here
```

### 4. Sandbox Testing (Optional)

To test against Deel's sandbox with sample data, set:

```bash
export DEEL_API_BASE_URL=https://api-sandbox.letsdeel.com/rest/v2
```

## Example Queries

Once configured, ask Claude things like:

- "Show me all active contracts"
- "What legal entities do we have?"
- "Get payslips for worker 12345"
- "List recent payments"
- "Show me the org structure — teams and departments"
- "What time off requests are pending?"
- "What countries does Deel support?"

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEEL_API_TOKEN` | Yes | — | Deel API bearer token |
| `DEEL_API_BASE_URL` | No | `https://api.letsdeel.com/rest/v2` | Override for sandbox |

## Tools Reference

| Tool | Description |
|---|---|
| `deel_get_organization` | Organization details |
| `deel_list_legal_entities` | Legal entities list |
| `deel_get_person` | Worker/employee details by ID |
| `deel_list_people_custom_fields` | Custom fields for people |
| `deel_list_contracts` | List contracts with filters |
| `deel_get_contract_adjustments` | Contract compensation adjustments |
| `deel_get_contract_timesheets` | Contract timesheets |
| `deel_get_payroll_reports` | Payroll reports by legal entity |
| `deel_get_gross_to_net` | Gross-to-net calculations |
| `deel_get_worker_payslips` | Worker payslips |
| `deel_get_worker_banks` | Worker bank accounts |
| `deel_list_invoices` | Salary invoices |
| `deel_list_deel_invoices` | Deel fee invoices |
| `deel_list_payments` | Payment receipts |
| `deel_get_payment_breakdown` | Payment line items |
| `deel_list_time_off_requests` | Time off requests |
| `deel_get_time_off_entitlements` | Worker time off balances |
| `deel_list_teams` | Organization teams |
| `deel_list_departments` | Organization departments |
| `deel_list_managers` | Organization managers |
| `deel_get_eor_benefits` | EOR contract benefits |
| `deel_list_worker_documents` | Worker document metadata |
| `deel_lookup_countries` | Supported countries |
| `deel_lookup_currencies` | Supported currencies |
| `deel_lookup_job_titles` | Available job titles |
| `deel_lookup_seniorities` | Seniority levels |
| `deel_lookup_time_off_types` | Time off types |

## License

MIT
