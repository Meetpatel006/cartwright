import dotenv from "dotenv";
dotenv.config({ path: "../../apps/web/.env" });
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`SELECT event_type, outcome, failure_classification, reason, metadata, created_at FROM audit_events WHERE event_type IN ('DISCOVERY_FAILED','DISCOVERY_COMPLETED') ORDER BY created_at DESC LIMIT 6`;
for (const r of rows) {
  console.log(r.created_at, "|", r.event_type, "|", r.outcome, "|", r.failure_classification ?? "", "|", String(r.reason ?? "").slice(0, 300), "|", JSON.stringify(r.metadata));
}
process.exit(0);
