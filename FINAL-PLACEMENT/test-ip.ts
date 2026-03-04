import "dotenv/config"
import { prisma } from "./lib/prisma"

async function test() {
    try {
        console.log("Testing Prisma connection with current environment...")
        const count = await prisma.user.count()
        console.log(`✅ Connection successful. Total users: ${count}`)
    } catch (error: any) {
        console.error("❌ Prisma Connection Failed")
        console.error(error.message)
    } finally {
        await prisma.$disconnect()
    }
}

test()
