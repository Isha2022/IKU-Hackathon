import { Client } from "pg";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: true,
    },
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT current_database(), NOW()"
    );

    console.log("Connected successfully!");
    console.log(result.rows);
  } catch (error) {
    console.error("Connection failed:", error);
  } finally {
    await client.end();
  }
}

main();