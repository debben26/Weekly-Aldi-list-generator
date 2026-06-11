// Load DATABASE_URL from .env for integration tests (mirrors prisma.config.ts).
import "dotenv/config";

// Integration tests create and delete real rows. They must only ever run against the local
// Docker Postgres (docker-compose.yml), never the live database in .env. Point them at the
// local DB explicitly with TEST_DATABASE_URL, e.g.
//   TEST_DATABASE_URL="postgresql://planner:planner@localhost:5432/meal_planner?schema=public"
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const url = process.env.DATABASE_URL ?? "";
let hostname = "";
try {
  hostname = new URL(url).hostname;
} catch {
  throw new Error("Integration tests: DATABASE_URL is missing or not a valid URL.");
}
if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  throw new Error(
    `Integration tests refuse to run against a non-local database (host "${hostname}"). ` +
      "Start the Docker Postgres (docker compose up -d), migrate + seed it, and set " +
      "TEST_DATABASE_URL to the local connection string from .env.example.",
  );
}
