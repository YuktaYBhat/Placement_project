import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Save or update the FCM token for the logged-in user
export async function POST(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            )
        }

        const { token } = await request.json()

        if (!token || typeof token !== "string") {
            return NextResponse.json(
                { error: "Valid FCM token is required" },
                { status: 400 }
            )
        }

        await (prisma.user as any).update({
            where: { id: session.user.id },
            data: { fcmToken: token }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Error saving FCM token:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

// DELETE - Clear the FCM token for the logged-in user (on logout)
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            )
        }

        await (prisma.user as any).update({
            where: { id: session.user.id },
            data: { fcmToken: null }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Error clearing FCM token:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
