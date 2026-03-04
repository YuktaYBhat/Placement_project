import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx ./prisma/seed.ts",
    },
    datasource: {
        // Use DATABASE_URL for migrations (DIRECT_URL is currently unreachable)
        url: process.env.DATABASE_URL || "",
    },
})
