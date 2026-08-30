const { Pool } = require("pg");

let pool;
let schemaReady;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

async function db() {
  const client = getPool();
  if (!schemaReady) {
    schemaReady = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          CONSTRAINT profiles_name_unique UNIQUE (name)
        );
        CREATE TABLE IF NOT EXISTS ledger_data (
          profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
          data JSONB NOT NULL DEFAULT '{"weekends": []}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })();
  }
  await schemaReady;
  return client;
}

module.exports = { db };
