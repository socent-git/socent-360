// Load a SocEnt 360 backup (Settings › Organisation records › Export full backup) into Supabase.
// Also the way to move data entered in the claude.ai version into this one.
//
//   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run restore -- backups/socent360-backup-2026-11-24.json
//
// The service-role key bypasses row-level security: run this only on your own computer, never in the browser or Vercel.
// Existing records with the same path are replaced; nothing else is deleted.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run restore -- path/to/backup.json");
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];
const add = (coll, id, data) => { if (data && typeof data === "object") rows.push({ path: coll + "/" + id, coll, doc_id: id, data }); };
for (const coll of ["programmes", "cohorts", "orgs", "edit"]) for (const [id, data] of Object.entries(backup[coll] || {})) add(coll, id, data);
for (const [id, data] of Object.entries(backup.config || {})) add("config", id, data);
if (!rows.length) { console.error("No records found in " + file); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
let done = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const { error } = await sb.from("docs").upsert(batch, { onConflict: "path" });
  if (error) { console.error("Stopped at record " + (i + 1) + ": " + error.message); process.exit(1); }
  done += batch.length;
  process.stdout.write("\rRestored " + done + " of " + rows.length);
}
console.log("\nDone. Open SocEnt 360 as an Admin: the Overview figures are re-published automatically.");
