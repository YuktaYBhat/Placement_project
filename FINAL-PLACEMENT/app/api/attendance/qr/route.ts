import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateQRToken } from "@/lib/qr-token"

// Helper to check tier eligibility
function canApplyToTier(studentTier: string | null, jobTier: string, isDreamOffer: boolean): { eligible: boolean; reason?: string } {
    if (isDreamOffer) return { eligible: true }
    if (!studentTier) return { eligible: true }

    if (studentTier === "TIER_1") {
        return { eligible: false, reason: "You are already placed in Tier 1 and blocked from further placements" }
    }
    if (studentTier === "TIER_2") {
        if (jobTier === "TIER_1") return { eligible: true }
        return { eligible: false, reason: "You are placed in Tier 2. You can only apply for Tier 1 jobs (>9 LPA)" }
    }
    if (studentTier === "TIER_3") {
        if (jobTier === "TIER_1" || jobTier === "TIER_2") return { eligible: true }
        return { eligible: false, reason: "You are placed in Tier 3. You can only apply for Tier 1 or Tier 2 jobs" }
    }
    return { eligible: true }
}

// Helper to extract batch year
function getBatchYear(batch: string | null | undefined): string {
    if (!batch || typeof batch !== 'string') return ""
    const parts = batch.split('-')
    return parts[parts.length - 1].trim()
}

// GET - Get QR token and round status for a student's job application
export async function GET(request: NextRequest) {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const jobId = searchParams.get("jobId")

        if (!jobId) {
            return NextResponse.json({ error: "jobId is required" }, { status: 400 })
        }

        // Check student has applied to this job
        const application = await prisma.application.findFirst({
            where: {
                jobId,
                userId: session.user.id,
                isRemoved: false,
            },
        })

        if (!application) {
            return NextResponse.json(
                { error: "You have not applied to this job" },
                { status: 403 }
            )
        }

        // Get job details for eligibility check
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                title: true,
                companyName: true,
                tier: true,
                isDreamOffer: true,
                minCGPA: true,
                allowedBranches: true,
                eligibleBatch: true,
                maxBacklogs: true,
            },
        })

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        // Check student profile and KYC
        const profile = await prisma.profile.findUnique({
            where: { userId: session.user.id },
            select: {
                kycStatus: true,
                finalCgpa: true,
                cgpa: true,
                branch: true,
                batch: true,
                activeBacklogs: true,
                hasBacklogs: true,
                highestPlacementTier: true,
            },
        })

        if (!profile || profile.kycStatus !== "VERIFIED") {
            return NextResponse.json(
                { error: "Your KYC must be verified to access attendance", kycRequired: true },
                { status: 403 }
            )
        }

        // Check basic eligibility for this job
        const eligibilityCheck = checkJobEligibility(profile, job)

        // Get all rounds for this job
        const rounds = await prisma.jobRound.findMany({
            where: { jobId, isRemoved: false },
            orderBy: { order: "asc" },
            include: {
                sessions: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        startTime: true,
                        endTime: true,
                    },
                },
            },
        })

        // Get student's attendance for all rounds of this job
        const attendances = await prisma.roundAttendance.findMany({
            where: {
                userId: session.user.id,
                jobId,
            },
            include: {
                round: { select: { id: true, name: true, order: true } },
            },
        })

        const attendanceMap = new Map(attendances.map((a) => [a.roundId, a]))

        // Build round status for student
        const roundStatuses = rounds.map((round) => {
            const latestSession = round.sessions[0] || null
            const attendance = attendanceMap.get(round.id)

            let status: string
            let qrToken: string | null = null
            let ineligibleReason: string | null = null

            if (attendance) {
                // Already attended this round
                status = `ATTENDED_${attendance.status}`
            } else if (!latestSession) {
                status = "NOT_STARTED"
            } else if (latestSession.status === "ACTIVE") {
                // Check eligibility for this round
                const roundEligibility = checkRoundEligibility(
                    round.order,
                    rounds,
                    attendanceMap,
                    eligibilityCheck
                )

                if (roundEligibility.eligible) {
                    // Generate a fresh signed QR token
                    qrToken = generateQRToken({
                        userId: session.user.id,
                        jobId,
                        roundId: round.id,
                        sessionId: latestSession.id,
                    })
                    status = "ACTIVE"
                } else {
                    status = "NOT_ELIGIBLE"
                    ineligibleReason = roundEligibility.reason || null
                }
            } else if (latestSession.status === "TEMP_CLOSED") {
                status = "TEMP_CLOSED"
            } else if (latestSession.status === "PERM_CLOSED") {
                status = "PERM_CLOSED"
            } else {
                status = "NOT_STARTED"
            }

            return {
                roundId: round.id,
                roundName: round.name,
                roundOrder: round.order,
                status,
                qrToken,
                ineligibleReason,
                attendance: attendance
                    ? {
                        markedAt: attendance.markedAt,
                        result: attendance.status,
                    }
                    : null,
            }
        })

        // Check if student is finally selected for this job
        const finalSelection = await (prisma as any).finalSelected.findFirst({
            where: {
                userId: session.user.id,
                jobId,
            },
            select: {
                id: true,
                selectedAt: true,
            },
        })

        return NextResponse.json({ 
            rounds: roundStatuses,
            jobEligibility: eligibilityCheck,
            finalSelected: finalSelection ? {
                isSelected: true,
                selectedAt: finalSelection.selectedAt,
            } : null
        })
    } catch (error) {
        console.error("Error generating attendance QR:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/**
 * Check if student meets job eligibility criteria
 */
function checkJobEligibility(
    profile: {
        finalCgpa: number | null
        cgpa: number | null
        branch: string | null
        batch: string | null
        activeBacklogs: boolean
        hasBacklogs: string | null
        highestPlacementTier: string | null
    },
    job: {
        tier: string
        isDreamOffer: boolean
        minCGPA: number | null
        allowedBranches: string[]
        eligibleBatch: string | null
        maxBacklogs: number | null
    }
): { eligible: boolean; reason?: string } {
    // Check placement tier eligibility
    const tierCheck = canApplyToTier(profile.highestPlacementTier, job.tier, job.isDreamOffer)
    if (!tierCheck.eligible) {
        return tierCheck
    }

    // Check CGPA
    const cgpa = profile.finalCgpa || profile.cgpa || 0
    if (job.minCGPA && cgpa < job.minCGPA) {
        return {
            eligible: false,
            reason: `Minimum CGPA required: ${job.minCGPA}. Your CGPA: ${cgpa.toFixed(2)}`
        }
    }

    // Check branch
    if (job.allowedBranches.length > 0 && profile.branch) {
        if (!job.allowedBranches.includes(profile.branch)) {
            return {
                eligible: false,
                reason: `Your branch (${profile.branch}) is not eligible for this job`
            }
        }
    }

    // Check batch
    if (job.eligibleBatch && profile.batch) {
        const studentBatchYear = getBatchYear(profile.batch)
        const jobBatchYear = getBatchYear(job.eligibleBatch)
        if (studentBatchYear !== jobBatchYear) {
            return {
                eligible: false,
                reason: `Only ${job.eligibleBatch} batch is eligible. Your batch: ${profile.batch}`
            }
        }
    }

    // Check backlogs
    const hasActiveBacklogs = profile.activeBacklogs || profile.hasBacklogs === "yes"
    if (job.maxBacklogs !== null && job.maxBacklogs === 0 && hasActiveBacklogs) {
        return {
            eligible: false,
            reason: "No active backlogs allowed for this job"
        }
    }

    return { eligible: true }
}

/**
 * Check if student is eligible for a given round
 * Round 1: Must meet job eligibility criteria
 * Round 2+: Must have been marked PASSED in the previous round
 */
function checkRoundEligibility(
    targetOrder: number,
    allRounds: Array<{ id: string; order: number; isRemoved: boolean }>,
    attendanceMap: Map<string, { status: string }>,
    jobEligibility: { eligible: boolean; reason?: string }
): { eligible: boolean; reason?: string } {
    // For round 1, check job eligibility criteria
    if (targetOrder === 1) {
        return jobEligibility
    }

    // For subsequent rounds, must have PASSED the immediate previous round
    const previousRounds = allRounds
        .filter((r) => r.order < targetOrder && !r.isRemoved)
        .sort((a, b) => b.order - a.order) // Sort descending to get the immediate previous first

    if (previousRounds.length === 0) {
        return jobEligibility // No previous rounds, treat as round 1
    }

    // Get the immediate previous round
    const immediatePrevRound = previousRounds[0]
    const prevAttendance = attendanceMap.get(immediatePrevRound.id)

    if (!prevAttendance) {
        return {
            eligible: false,
            reason: "You have not attended the previous round yet"
        }
    }

    // Must be explicitly marked as PASSED to proceed
    if (prevAttendance.status !== "PASSED") {
        if (prevAttendance.status === "FAILED") {
            return {
                eligible: false,
                reason: "You were not shortlisted for this round"
            }
        }
        return {
            eligible: false,
            reason: "Waiting for results from the previous round. Admin will shortlist for the next round."
        }
    }

    return { eligible: true }
}
