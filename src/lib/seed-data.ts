/** Synthetic company: Northstar Pay — fintech payments platform */

export const COMPANY = {
  name: "Northstar Pay",
  tagline: "Payments infrastructure for mid-market SaaS",
};

export const teams = [
  { id: "t_plat", name: "Platform", mission: "Core services and reliability" },
  { id: "t_pay", name: "Payments", mission: "Card rails, settlements, PSP integrations" },
  { id: "t_risk", name: "Risk", mission: "Fraud, AML, chargebacks" },
  { id: "t_dx", name: "Developer Experience", mission: "SDKs, docs, partner APIs" },
  { id: "t_ops", name: "Ops", mission: "On-call, incidents, runbooks" },
];

export const people = [
  { id: "p_priya", name: "Priya Shah", role: "Staff Engineer", team: "t_pay", active: true, leftAt: null },
  { id: "p_marcus", name: "Marcus Chen", role: "Senior Engineer", team: "t_pay", active: true, leftAt: null },
  { id: "p_lena", name: "Lena Ortiz", role: "Engineering Manager", team: "t_pay", active: true, leftAt: null },
  { id: "p_jon", name: "Jon Park", role: "Staff SRE", team: "t_ops", active: true, leftAt: null },
  { id: "p_aya", name: "Aya Okonkwo", role: "Senior Engineer", team: "t_risk", active: true, leftAt: null },
  { id: "p_sam", name: "Sam Rivera", role: "Engineer", team: "t_plat", active: true, leftAt: null },
  { id: "p_nina", name: "Nina Berg", role: "Staff Engineer", team: "t_plat", active: true, leftAt: null },
  { id: "p_dev", name: "Dev Kapoor", role: "Senior Engineer", team: "t_dx", active: true, leftAt: null },
  { id: "p_kai", name: "Kai Nakamura", role: "Engineer", team: "t_risk", active: true, leftAt: null },
  { id: "p_owen", name: "Owen Blake", role: "Senior Engineer", team: "t_pay", active: false, leftAt: "2026-08-12" },
  { id: "p_rita", name: "Rita Gomez", role: "Compliance Lead", team: "t_risk", active: true, leftAt: null },
  { id: "p_eli", name: "Eli Moss", role: "Product Manager", team: "t_pay", active: true, leftAt: null },
];

export const services = [
  { id: "s_ledger", name: "ledger-core", criticality: "critical", desc: "Double-entry ledger and balances" },
  { id: "s_rails", name: "card-rails", criticality: "critical", desc: "Card authorization and capture" },
  { id: "s_settle", name: "settlement", criticality: "high", desc: "Merchant payouts and reconciliation" },
  { id: "s_fraud", name: "fraud-engine", criticality: "critical", desc: "Real-time fraud scoring" },
  { id: "s_webhooks", name: "webhooks", criticality: "medium", desc: "Outbound event delivery" },
  { id: "s_sdk", name: "partner-sdk", criticality: "medium", desc: "Public SDK and API gateway" },
  { id: "s_identity", name: "identity", criticality: "high", desc: "Merchant auth and RBAC" },
  { id: "s_billing", name: "billing-ui", criticality: "low", desc: "Merchant billing dashboard" },
];

export const ownership = [
  { person: "p_priya", service: "s_rails", declared: true },
  { person: "p_priya", service: "s_ledger", declared: true },
  { person: "p_marcus", service: "s_settle", declared: true },
  { person: "p_aya", service: "s_fraud", declared: true },
  { person: "p_kai", service: "s_fraud", declared: false },
  { person: "p_nina", service: "s_identity", declared: true },
  { person: "p_sam", service: "s_webhooks", declared: true },
  { person: "p_dev", service: "s_sdk", declared: true },
  { person: "p_jon", service: "s_ledger", declared: false },
  { person: "p_owen", service: "s_rails", declared: true },
];

export const docs = [
  {
    id: "d_rfc_stripe",
    title: "RFC-014: Adopt Stripe as primary PSP",
    kind: "rfc",
    status: "superseded",
    updatedAt: "2025-11-02",
    body: "Proposal to standardize on Stripe for card processing in US/EU.",
  },
  {
    id: "d_rfc_adyen",
    title: "RFC-022: Migrate EU traffic to Adyen",
    kind: "rfc",
    status: "active",
    updatedAt: "2026-03-18",
    body: "EU SCA and local methods favor Adyen; Stripe remains US primary.",
  },
  {
    id: "d_run_rails",
    title: "Runbook: card-rails auth failures",
    kind: "runbook",
    status: "active",
    updatedAt: "2026-09-01",
    body: "Steps for elevated 5xx on /v1/authorize. Check PSP circuit breaker, replay queue depth.",
  },
  {
    id: "d_run_ledger",
    title: "Runbook: ledger-core imbalance alerts",
    kind: "runbook",
    status: "active",
    updatedAt: "2026-07-22",
    body: "Imbalance > $1k: freeze settlements, page ledger on-call, reconcile pending journals.",
  },
  {
    id: "d_policy_aml",
    title: "Policy: AML escalation thresholds",
    kind: "policy",
    status: "active",
    updatedAt: "2026-05-10",
    body: "SAR filing required above $10k unexplained velocity within 24h.",
  },
  {
    id: "d_arch_payments",
    title: "Architecture: payments domain map",
    kind: "architecture",
    status: "active",
    updatedAt: "2026-08-30",
    body: "card-rails → ledger-core → settlement. fraud-engine sits on authorize path.",
  },
];

export const tickets = [
  { id: "tk_441", title: "EU Soft Decline spike after Stripe rollout", status: "closed", openedAt: "2026-02-01", closedAt: "2026-02-14" },
  { id: "tk_502", title: "Settlement lag for ACH merchants", status: "closed", openedAt: "2026-04-03", closedAt: "2026-04-20" },
  { id: "tk_618", title: "Fraud false positives on marketplace sellers", status: "open", openedAt: "2026-09-12", closedAt: null },
  { id: "tk_640", title: "Refactor card-rails retry budgets", status: "open", openedAt: "2026-09-28", closedAt: null },
  { id: "tk_701", title: "Ledger imbalance during DST flip", status: "closed", openedAt: "2026-03-09", closedAt: "2026-03-11" },
];

export const prs = [
  { id: "pr_188", title: "feat(rails): Adyen EU authorize adapter", mergedAt: "2026-03-20", service: "s_rails" },
  { id: "pr_201", title: "fix(settle): ACH cutoff window", mergedAt: "2026-04-18", service: "s_settle" },
  { id: "pr_220", title: "feat(fraud): marketplace seller features", mergedAt: "2026-09-15", service: "s_fraud" },
  { id: "pr_231", title: "refactor(rails): retry budget + jitter", mergedAt: "2026-10-02", service: "s_rails" },
  { id: "pr_145", title: "fix(ledger): DST-safe journal timestamps", mergedAt: "2026-03-10", service: "s_ledger" },
  { id: "pr_160", title: "docs(sdk): webhooks signature guide", mergedAt: "2026-06-01", service: "s_sdk" },
];

export const prAuthors = [
  { pr: "pr_188", person: "p_priya", rel: "WROTE" },
  { pr: "pr_188", person: "p_marcus", rel: "REVIEWED" },
  { pr: "pr_188", person: "p_lena", rel: "MERGED" },
  { pr: "pr_201", person: "p_marcus", rel: "WROTE" },
  { pr: "pr_201", person: "p_priya", rel: "REVIEWED" },
  { pr: "pr_220", person: "p_aya", rel: "WROTE" },
  { pr: "pr_220", person: "p_kai", rel: "REVIEWED" },
  { pr: "pr_231", person: "p_priya", rel: "WROTE" },
  { pr: "pr_231", person: "p_marcus", rel: "REVIEWED" },
  { pr: "pr_145", person: "p_priya", rel: "WROTE" },
  { pr: "pr_145", person: "p_jon", rel: "REVIEWED" },
  { pr: "pr_145", person: "p_nina", rel: "REVIEWED" },
  { pr: "pr_160", person: "p_dev", rel: "WROTE" },
  { pr: "pr_160", person: "p_sam", rel: "REVIEWED" },
];

export const ticketLinks = [
  { ticket: "tk_441", person: "p_priya", rel: "FIXED" },
  { ticket: "tk_441", person: "p_eli", rel: "REPORTED" },
  { ticket: "tk_441", service: "s_rails", rel: "AFFECTS" },
  { ticket: "tk_502", person: "p_marcus", rel: "FIXED" },
  { ticket: "tk_502", service: "s_settle", rel: "AFFECTS" },
  { ticket: "tk_618", person: "p_aya", rel: "ASSIGNED" },
  { ticket: "tk_618", service: "s_fraud", rel: "AFFECTS" },
  { ticket: "tk_640", person: "p_priya", rel: "ASSIGNED" },
  { ticket: "tk_640", service: "s_rails", rel: "AFFECTS" },
  { ticket: "tk_701", person: "p_priya", rel: "FIXED" },
  { ticket: "tk_701", person: "p_jon", rel: "PAGED_FOR" },
  { ticket: "tk_701", service: "s_ledger", rel: "AFFECTS" },
];

export const incidents = [
  {
    id: "inc_77",
    title: "SEV-1: card authorize outage (Stripe US)",
    severity: "SEV-1",
    openedAt: "2026-02-11",
    resolvedAt: "2026-02-11",
    service: "s_rails",
  },
  {
    id: "inc_91",
    title: "SEV-2: ledger imbalance after DST",
    severity: "SEV-2",
    openedAt: "2026-03-09",
    resolvedAt: "2026-03-10",
    service: "s_ledger",
  },
  {
    id: "inc_104",
    title: "SEV-2: fraud engine latency",
    severity: "SEV-2",
    openedAt: "2026-09-14",
    resolvedAt: "2026-09-14",
    service: "s_fraud",
  },
];

export const incidentPeople = [
  { incident: "inc_77", person: "p_priya", rel: "FIXED" },
  { incident: "inc_77", person: "p_jon", rel: "PAGED_FOR" },
  { incident: "inc_77", person: "p_owen", rel: "PAGED_FOR" },
  { incident: "inc_91", person: "p_priya", rel: "FIXED" },
  { incident: "inc_91", person: "p_jon", rel: "PAGED_FOR" },
  { incident: "inc_104", person: "p_aya", rel: "FIXED" },
  { incident: "inc_104", person: "p_kai", rel: "PAGED_FOR" },
];

export const decisions = [
  {
    id: "dec_01",
    title: "Choose Stripe as primary PSP",
    summary: "Standardize US card traffic on Stripe for speed to market.",
    decidedAt: "2025-11-10",
    status: "superseded",
    owners: ["p_eli", "p_lena"],
    cites: ["d_rfc_stripe"],
  },
  {
    id: "dec_02",
    title: "Split PSPs: Stripe US + Adyen EU",
    summary: "Keep Stripe in US; route EU to Adyen for SCA and local methods.",
    decidedAt: "2026-03-18",
    status: "active",
    owners: ["p_eli", "p_priya", "p_rita"],
    cites: ["d_rfc_adyen", "tk_441", "pr_188", "inc_77"],
  },
  {
    id: "dec_03",
    title: "Freeze settlements on ledger imbalance > $1k",
    summary: "Automatic settlement freeze until ledger on-call clears imbalance.",
    decidedAt: "2026-03-11",
    status: "active",
    owners: ["p_jon", "p_nina"],
    cites: ["d_run_ledger", "inc_91", "tk_701"],
  },
];

export const decisionLinks = [
  { from: "dec_02", to: "dec_01", rel: "SUPERSEDES" },
];

export const docAuthors = [
  { doc: "d_rfc_stripe", person: "p_eli" },
  { doc: "d_rfc_adyen", person: "p_priya" },
  { doc: "d_run_rails", person: "p_priya" },
  { doc: "d_run_ledger", person: "p_jon" },
  { doc: "d_policy_aml", person: "p_rita" },
  { doc: "d_arch_payments", person: "p_nina" },
];

export const serviceDeps = [
  { from: "s_rails", to: "s_fraud", rel: "DEPENDS_ON" },
  { from: "s_rails", to: "s_ledger", rel: "DEPENDS_ON" },
  { from: "s_settle", to: "s_ledger", rel: "DEPENDS_ON" },
  { from: "s_webhooks", to: "s_rails", rel: "DEPENDS_ON" },
  { from: "s_sdk", to: "s_identity", rel: "DEPENDS_ON" },
  { from: "s_billing", to: "s_settle", rel: "DEPENDS_ON" },
];

export const skills = [
  { person: "p_priya", skill: "Cypher-less payments rails", weight: 5 },
  { person: "p_priya", skill: "PSP adapters", weight: 5 },
  { person: "p_marcus", skill: "Settlements", weight: 4 },
  { person: "p_aya", skill: "Fraud ML features", weight: 5 },
  { person: "p_jon", skill: "Incident command", weight: 5 },
  { person: "p_nina", skill: "Identity & auth", weight: 4 },
  { person: "p_dev", skill: "Public APIs", weight: 4 },
  { person: "p_owen", skill: "Legacy Stripe path", weight: 3 },
];
