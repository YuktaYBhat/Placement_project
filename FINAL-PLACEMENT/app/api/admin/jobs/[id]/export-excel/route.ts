import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import * as XLSX from "xlsx"

// POST - Export attendance/selections to Excel
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error, session } = await requireAdmin()
        if (error || !session) return error

        const { id: jobId } = await params
        const body = await request.json()
        
        const {
            type = "attendance", // "attendance" | "passed" | "final_selected" | "all_rounds"
            roundId,
            status,
            selectedIds,
            columns = ["usn", "name", "branch", "cgpa", "status", "time"], // Selected columns
        } = body

        // Define all available columns and their headers
        const columnDefs: Record<string, { header: string; getValue: (row: any, idx?: number) => string | number }> = {
            slNo: { header: "Sl. No.", getValue: (_: any, idx?: number) => (idx ?? 0) + 1 },
            usn: { header: "USN", getValue: (row) => row.profile?.usn || "N/A" },
            name: { header: "Student Name", getValue: (row) => row.user?.name || `${row.profile?.firstName || ""} ${row.profile?.lastName || ""}`.trim() || "N/A" },
            email: { header: "Email", getValue: (row) => row.user?.email || "N/A" },
            branch: { header: "Branch", getValue: (row) => row.profile?.branch || "N/A" },
            cgpa: { header: "CGPA", getValue: (row) => row.profile?.finalCgpa || row.profile?.cgpa || "N/A" },
            batch: { header: "Batch", getValue: (row) => row.profile?.batch || row.year || "N/A" },
            phone: { header: "Phone", getValue: (row) => row.profile?.callingMobile || row.profile?.phone || "N/A" },
            parentPhone: { header: "Parent Phone", getValue: (row) => row.profile?.fatherMobile || row.profile?.motherMobile || "N/A" },
            round: { header: "Round", getValue: (row) => row.round?.name || "N/A" },
            status: { header: "Status", getValue: (row) => row.status || "N/A" },
            time: { header: "Marked At", getValue: (row) => row.markedAt ? new Date(row.markedAt).toLocaleString() : (row.selectedAt ? new Date(row.selectedAt).toLocaleString() : "N/A") },
            package: { header: "Package (LPA)", getValue: (row) => row.package || "N/A" },
            tier: { header: "Tier", getValue: (row) => row.tier || "N/A" },
            role: { header: "Role", getValue: (row) => row.role || "N/A" },
        }

        let data: any[] = []
        let sheetName = "Export"

        // Get job details
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { title: true, companyName: true },
        })

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        if (type === "final_selected") {
            // Export final selected students
            const where: any = { jobId }
            if (selectedIds && selectedIds.length > 0) {
                where.id = { in: selectedIds }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const selections = await (prisma as any).finalSelected.findMany({
                where,
                orderBy: { selectedAt: "desc" },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            })

            const userIds = selections.map((s: { userId: string }) => s.userId)
            const profiles = await prisma.profile.findMany({
                where: { userId: { in: userIds } },
                select: {
                    userId: true,
                    usn: true,
                    branch: true,
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
            data = selections.map((s: { userId: string }) => ({ ...s, profile: profileMap.get(s.userId) }))
            sheetName = "Final Selected"

        } else {
            // Export attendance records
            const where: any = { jobId }
            if (roundId) where.roundId = roundId
            if (status && status !== "ALL") where.status = status
            if (selectedIds && selectedIds.length > 0) {
                where.id = { in: selectedIds }
            }

            const attendances = await prisma.roundAttendance.findMany({
                where,
                orderBy: { markedAt: "desc" },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    round: { select: { name: true, order: true } },
                },
            })

            const userIds = attendances.map((a) => a.userId)
            const profiles = await prisma.profile.findMany({
                where: { userId: { in: userIds } },
                select: {
                    userId: true,
                    usn: true,
                    branch: true,
                    finalCgpa: true,
                    cgpa: true,
                    batch: true,
                    callingMobile: true,
                    fatherMobile: true,
                    motherMobile: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                },
            })

            const profileMap = new Map(profiles.map((p) => [p.userId, p]))
            data = attendances.map((a) => ({ ...a, profile: profileMap.get(a.userId) }))
            
            if (type === "passed") {
                data = data.filter((d) => d.status === "PASSED")
                sheetName = "Passed Students"
            } else {
                sheetName = "Attendance"
            }
        }

        if (data.length === 0) {
            return NextResponse.json({ error: "No data to export" }, { status: 400 })
        }

        // Always include slNo at the start
        const finalColumns = ["slNo", ...columns.filter((c: string) => c !== "slNo")]

        // Build the export data
        const headers = finalColumns.map((col: string) => columnDefs[col]?.header || col)
        const rows = data.map((row, idx) => 
            finalColumns.map((col: string) => columnDefs[col]?.getValue(row, idx) || "")
        )

        // Create workbook
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
        
        // Set column widths
        const colWidths = finalColumns.map((col: string) => {
            if (col === "slNo") return { wch: 8 }
            if (col === "email") return { wch: 30 }
            if (col === "name") return { wch: 25 }
            if (col === "usn") return { wch: 15 }
            return { wch: 15 }
        })
        worksheet["!cols"] = colWidths

        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

        // Return as downloadable file
        const filename = `${job.companyName.replace(/\s+/g, "_")}_${sheetName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })
    } catch (error) {
        console.error("Error exporting to Excel:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
