import { pool } from "./client";

async function testConnection() {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS username,
        NOW() AS server_time,
        version() AS postgres_version
    `);

    console.log("✅ Connected to Tiger Data!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
