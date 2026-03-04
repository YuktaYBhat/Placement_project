import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, logSecurityEvent } from "@/lib/auth-helpers"

// GET - Get attendance records for a job (filterable by round)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const { searchParams } = new URL(request.url)
        const roundId = searchParams.get("roundId")
        const status = searchParams.get("status")
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "50")
        const skip = (page - 1) * limit

        const where: any = { jobId }
        if (roundId) where.roundId = roundId
        if (status) where.status = status

        const [attendances, total] = await Promise.all([
            prisma.roundAttendance.findMany({
                where,
                orderBy: { markedAt: "desc" },
                skip,
                take: limit,
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                    round: {
                        select: { id: true, name: true, order: true },
                    },
                    session: {
                        select: { id: true, status: true },
                    },
                },
            }),
            prisma.roundAttendance.count({ where }),
        ])

        // Enrich with profile data
        const userIds = attendances.map((a) => a.userId)
        const profiles = await prisma.profile.findMany({
            where: { userId: { in: userIds } },
            select: {
                userId: true,
                usn: true,
                branch: true,
                profilePhoto: true,
                finalCgpa: true,
                cgpa: true,
                resumeUpload: true,
                resume: true,
                firstName: true,
                lastName: true,
            },
        })

        const profileMap = new Map(profiles.map((p) => [p.userId, p]))

        const enriched = attendances.map((a) => ({
            ...a,
            profile: profileMap.get(a.userId) || null,
        }))

        return NextResponse.json({
            attendances: enriched,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        })
    } catch (error) {
        console.error("Error fetching round attendance:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// PUT - Update attendance status (PASSED/FAILED) - supports batch updates
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const body = await request.json()
        
        // Support both single and batch updates
        const attendanceIds: string[] = body.attendanceIds || (body.attendanceId ? [body.attendanceId] : [])
        const status = body.status

        if (attendanceIds.length === 0 || !status) {
            return NextResponse.json(
                { error: "attendanceId(s) and status are required" },
                { status: 400 }
            )
        }

        if (!["ATTENDED", "PASSED", "FAILED"].includes(status)) {
            return NextResponse.json(
                { error: "Invalid status. Use ATTENDED, PASSED, or FAILED" },
                { status: 400 }
            )
        }

        // Get all attendance records for this batch
        const attendances = await prisma.roundAttendance.findMany({
            where: { id: { in: attendanceIds }, jobId },
            include: {
                round: { select: { id: true, order: true, name: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        })

        if (attendances.length === 0) {
            return NextResponse.json({ error: "No attendance records found" }, { status: 404 })
        }

        // Get all rounds for this job to determine final round
        const allRounds = await prisma.jobRound.findMany({
            where: { jobId, isRemoved: false },
            orderBy: { order: "desc" },
        })

        const finalRound = allRounds[0] // Highest order = final round
        
        console.log("DEBUG: All rounds for job:", allRounds.map(r => ({ id: r.id, name: r.name, order: r.order })))
        console.log("DEBUG: Final round:", finalRound ? { id: finalRound.id, name: finalRound.name, order: finalRound.order } : null)
        console.log("DEBUG: Selected attendances rounds:", attendances.map(a => ({ attendanceId: a.id, roundId: a.round.id, roundName: a.round.name, roundOrder: a.round.order })))

        // Update all attendance records
        await prisma.roundAttendance.updateMany({
            where: { id: { in: attendanceIds }, jobId },
            data: { status },
        })

        // For "PASSED" status on final round, auto-create FinalSelected
        if (status === "PASSED" && finalRound) {
            const finalRoundAttendances = attendances.filter(a => a.round.id === finalRound.id)
            console.log("DEBUG: Final round attendances count:", finalRoundAttendances.length)
            
            if (finalRoundAttendances.length > 0) {
                // Get job details for FinalSelected
                const job = await prisma.job.findUnique({
                    where: { id: jobId },
                    select: { title: true, tier: true, salary: true, minSalary: true, maxSalary: true, companyName: true },
                })
                
                console.log("DEBUG: Job details:", job)

                // Get profiles for these users to get USN and batch
                const userIds = finalRoundAttendances.map(a => a.userId)
                const profiles = await prisma.profile.findMany({
                    where: { userId: { in: userIds } },
                    select: { userId: true, usn: true, batch: true, highestPlacementTier: true },
                })
                const profileMap = new Map(profiles.map(p => [p.userId, p]))

                // Tier priority order (lower index = higher priority)
                const tierPriority: Record<string, number> = { "TIER_1": 0, "DREAM": 1, "TIER_2": 2, "TIER_3": 3 }

                // Create FinalSelected records and update placements
                for (const attendance of finalRoundAttendances) {
                    const profile = profileMap.get(attendance.userId)
                    const jobTier = job?.tier || "TIER_3"
                    
                    console.log("DEBUG: Creating FinalSelected for user:", attendance.userId, "job:", jobId)
                    
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (prisma as any).finalSelected.upsert({
                            where: {
                                userId_jobId: {
                                    userId: attendance.userId,
                                    jobId: jobId,
                                },
                            },
                            update: {
                                tier: jobTier,
                                package: job?.maxSalary || null,
                                role: job?.title || null,
                                isManual: false,
                            },
                            create: {
                                userId: attendance.userId,
                                jobId: jobId,
                                usn: profile?.usn || null,
                                year: profile?.batch || null,
                                tier: jobTier,
                                package: job?.maxSalary || null,
                                role: job?.title || null,
                                isManual: false,
                            },
                        })
                        console.log("DEBUG: FinalSelected created/updated successfully")
                    } catch (error) {
                        console.error("DEBUG: Error creating FinalSelected:", error)
                    }

                    try {
                        // Create or update Placement record
                        await prisma.placement.upsert({
                            where: {
                                userId_jobId: {
                                    userId: attendance.userId,
                                    jobId: jobId,
                                },
                            },
                            update: {
                                tier: jobTier,
                                salary: job?.maxSalary || 0,
                            },
                            create: {
                                userId: attendance.userId,
                                jobId: jobId,
                                tier: jobTier,
                                salary: job?.maxSalary || 0,
                                companyName: job?.companyName || "Unknown",
                            },
                        })
                        console.log("DEBUG: Placement created/updated successfully")
                    } catch (error) {
                        console.error("DEBUG: Error creating Placement:", error)
                    }

                    // Update highest placement tier if this is better
                    const currentTier = profile?.highestPlacementTier
                    const currentPriority = currentTier ? tierPriority[currentTier] ?? 4 : 4
                    const newPriority = tierPriority[jobTier] ?? 4

                    if (newPriority < currentPriority) {
                        await prisma.profile.update({
                            where: { userId: attendance.userId },
                            data: {
                                highestPlacementTier: jobTier,
                                placedAt: new Date(),
                            },
                        })
                    } else if (!currentTier) {
                        // First placement
                        await prisma.profile.update({
                            where: { userId: attendance.userId },
                            data: {
                                highestPlacementTier: jobTier,
                                placedAt: new Date(),
                            },
                        })
                    }
                }

                logSecurityEvent("final_selections_auto_created", {
                    adminId: session.user.id,
                    jobId,
                    userIds,
                    count: finalRoundAttendances.length,
                })
            }
        }

        logSecurityEvent("batch_attendance_status_updated", {
            adminId: session.user.id,
            jobId,
            attendanceIds,
            newStatus: status,
            count: attendances.length,
        })

        // Return updated records
        const updated = await prisma.roundAttendance.findMany({
            where: { id: { in: attendanceIds } },
            include: {
                user: { select: { name: true, email: true } },
                round: { select: { name: true } },
            },
        })

        return NextResponse.json({ 
            attendances: updated,
            message: `${updated.length} attendance record(s) updated to ${status}`,
        })
    } catch (error) {
        console.error("Error updating attendance status:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
