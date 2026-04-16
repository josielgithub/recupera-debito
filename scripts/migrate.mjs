import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

const sqlFile = join(__dirname, "../drizzle/0008_shallow_toxin.sql");
const sql = readFileSync(sqlFile, "utf-8");

// Split by --> statement-breakpoint
const statements = sql
  .split("--> statement-breakpoint")
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Applying ${statements.length} SQL statements...`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await connection.execute(stmt);
    console.log(`[${i + 1}/${statements.length}] OK`);
  } catch (err) {
    const msg = err.message || String(err);
    if (
      msg.includes("Duplicate column name") ||
      msg.includes("already exists") ||
      msg.includes("Table") && msg.includes("already exists")
    ) {
      console.log(`[${i + 1}/${statements.length}] SKIP (already exists)`);
    } else {
      console.error(`[${i + 1}/${statements.length}] ERROR: ${msg}`);
      console.error("Statement:", stmt.slice(0, 200));
    }
  }
}

await connection.end();
console.log("Migration complete.");
