import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, logSecurityEvent } from "@/lib/auth-helpers"

// GET - Get final selected students for a job
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const { searchParams } = new URL(request.url)
        const year = searchParams.get("year")
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "50")
        const skip = (page - 1) * limit

        const where: any = { jobId }
        if (year) where.year = year

        const [selections, total] = await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (prisma as any).finalSelected.findMany({
                where,
                orderBy: { selectedAt: "desc" },
                skip,
                take: limit,
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                    job: {
                        select: { title: true, companyName: true },
                    },
                },
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (prisma as any).finalSelected.count({ where }),
        ])

        // Enrich with profile data
        const userIds = selections.map((s: { userId: string }) => s.userId)
        const profiles = await prisma.profile.findMany({
            where: { userId: { in: userIds } },
            select: {
                userId: true,
                usn: true,
                branch: true,
                profilePhoto: true,
                finalCgpa: true,
                cgpa: true,
                batch: true,
                callingMobile: true,
                fatherMobile: true,
                motherMobile: true,
                firstName: true,
                lastName: true,
            },
        })

        const profileMap = new Map(profiles.map((p) => [p.userId, p]))

        const enriched = selections.map((s: Record<string, unknown>) => ({
            ...s,
            profile: profileMap.get(s.userId as string) || null,
        }))

        return NextResponse.json({
            selections: enriched,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        })
    } catch (error) {
        console.error("Error fetching final selections:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// POST - Manually add a student to final selected (admin override)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const { userId, tier, package: pkg, role } = await request.json()

        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 })
        }

        // Check job exists
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { title: true, tier: true, maxSalary: true },
        })

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        // Check user exists and has applied
        const application = await prisma.application.findFirst({
            where: { jobId, userId, isRemoved: false },
        })

        if (!application) {
            return NextResponse.json(
                { error: "User has not applied to this job" },
                { status: 400 }
            )
        }

        // Get user profile for snapshot data
        const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { usn: true, batch: true },
        })

        // Create or update final selection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selection = await (prisma as any).finalSelected.upsert({
            where: {
                userId_jobId: {
                    userId,
                    jobId,
                },
            },
            update: {
                tier: tier || job.tier || "TIER_3",
                package: pkg || job.maxSalary || null,
                role: role || job.title || null,
                isManual: true,
            },
            create: {
                userId,
                jobId,
                usn: profile?.usn || null,
                year: profile?.batch || null,
                tier: tier || job.tier || "TIER_3",
                package: pkg || job.maxSalary || null,
                role: role || job.title || null,
                isManual: true,
            },
            include: {
                user: { select: { name: true, email: true } },
            },
        })

        logSecurityEvent("final_selection_manual_added", {
            adminId: session.user.id,
            jobId,
            userId,
            isManual: true,
        })

        return NextResponse.json({ selection }, { status: 201 })
    } catch (error) {
        console.error("Error adding final selection:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// DELETE - Remove a final selection
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const { searchParams } = new URL(request.url)
        const selectionId = searchParams.get("selectionId")

        if (!selectionId) {
            return NextResponse.json({ error: "selectionId is required" }, { status: 400 })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selection = await (prisma as any).finalSelected.findFirst({
            where: { id: selectionId, jobId },
        })

        if (!selection) {
            return NextResponse.json({ error: "Selection not found" }, { status: 404 })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).finalSelected.delete({
            where: { id: selectionId },
        })

        logSecurityEvent("final_selection_removed", {
            adminId: session.user.id,
            jobId,
            selectionId,
            userId: selection.userId,
        })

        return NextResponse.json({ message: "Selection removed successfully" })
    } catch (error) {
        console.error("Error removing final selection:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
