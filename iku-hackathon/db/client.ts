import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

// pg connection-string SSL parameters override the explicit Pool `ssl` object.
// Remove them so this project's local-development TLS setting is actually used.
const databaseUrl = new URL(process.env.DATABASE_URL);
for (const option of ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslcrl"]) {
  databaseUrl.searchParams.delete(option);
}

export const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  connectionTimeoutMillis: 10000,
});
