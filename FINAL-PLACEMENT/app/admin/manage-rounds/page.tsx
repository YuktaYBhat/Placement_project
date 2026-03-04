"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Play,
    Pause,
    StopCircle,
    Plus,
    Briefcase,
    Clock,
    Users,
    CheckCircle,
    XCircle,
    ScanLine,
    Download,
    BarChart3,
    ArrowUp,
    ArrowDown,
    Loader2,
    User,
    Phone,
    Mail,
    GraduationCap,
    Trophy,
    ThumbsUp,
    ThumbsDown,
    FileSpreadsheet,
    Camera,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { QRScanner } from "@/components/admin/qr-scanner"

interface Job {
    id: string
    title: string
    companyName: string
    status: string
    tier: string
    salary?: number
}

interface Round {
    id: string
    name: string
    order: number
    isRemoved: boolean
    sessions: Array<{
        id: string
        status: string
        startTime: string
        endTime?: string
    }>
    _count: {
        attendances: number
    }
}

interface DriveSession {
    id: string
    status: string
    startTime: string
    endTime?: string
    round: {
        id: string
        name: string
        order: number
    }
    _count: {
        attendances: number
    }
}

interface AttendanceRecord {
    id: string
    userId: string
    status: string
    markedAt: string
    user: {
        id: string
        name: string
        email: string
    }
    round: {
        id: string
        name: string
        order: number
    }
    profile?: {
        usn?: string
        branch?: string
        profilePhoto?: string
        finalCgpa?: number
        cgpa?: number
        callingMobile?: string
        fatherMobile?: string
        motherMobile?: string
        firstName?: string
        lastName?: string
        batch?: string
    } | null
}

interface FinalSelectedRecord {
    id: string
    userId: string
    usn?: string
    year?: string
    tier: string
    package?: number
    role?: string
    isManual: boolean
    selectedAt: string
    user: {
        name: string
        email: string
    }
    job: {
        title: string
        companyName: string
    }
    profile?: {
        usn?: string
        branch?: string
        profilePhoto?: string
        finalCgpa?: number
        cgpa?: number
        batch?: string
    } | null
}

interface ScanResult {
    success: boolean
    message: string
    requireConfirmation?: boolean
    alreadyAttended?: boolean
    student?: {
        name: string
        email: string
        usn?: string
        branch?: string
        profilePhoto?: string
        phone?: string
        parentPhone?: string
    }
    job?: {
        title: string
        company: string
    }
    round?: {
        id?: string
        name: string
        order: number
    }
    scannedAt?: string
    markedAt?: string
    tokenData?: {
        userId: string
        jobId: string
        roundId: string
        sessionId: string
    }
}

const EXPORT_COLUMNS = [
    { id: "usn", label: "USN" },
    { id: "name", label: "Name" },
    { id: "email", label: "Email" },
    { id: "branch", label: "Branch" },
    { id: "cgpa", label: "CGPA" },
    { id: "batch", label: "Batch" },
    { id: "phone", label: "Phone" },
    { id: "parentPhone", label: "Parent Phone" },
    { id: "round", label: "Round" },
    { id: "status", label: "Status" },
    { id: "time", label: "Marked Time" },
    { id: "package", label: "Package (LPA)" },
    { id: "tier", label: "Tier" },
    { id: "role", label: "Role" },
]

export default function ManageRoundsPage() {
    // State
    const [jobs, setJobs] = useState<Job[]>([])
    const [selectedJobId, setSelectedJobId] = useState<string>("")
    const [rounds, setRounds] = useState<Round[]>([])
    const [sessions, setSessions] = useState<DriveSession[]>([])
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([])
    const [finalSelections, setFinalSelections] = useState<FinalSelectedRecord[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Round creation
    const [newRoundNames, setNewRoundNames] = useState("")
    const [showCreateRoundDialog, setShowCreateRoundDialog] = useState(false)

    // Session creation
    const [showStartSessionDialog, setShowStartSessionDialog] = useState(false)
    const [sessionRoundId, setSessionRoundId] = useState("")
    const [sessionDate, setSessionDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [sessionTime, setSessionTime] = useState(format(new Date(), "HH:mm"))
    const [sessionDuration, setSessionDuration] = useState(60)

    // Scanner
    const [showScannerDialog, setShowScannerDialog] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    // Attendance filters
    const [attendanceRoundId, setAttendanceRoundId] = useState<string>("ALL")
    const [attendanceStatus, setAttendanceStatus] = useState<string>("ALL")
    const [selectedAttendances, setSelectedAttendances] = useState<Set<string>>(new Set())

    // Export
    const [showExportDialog, setShowExportDialog] = useState(false)
    const [exportType, setExportType] = useState<"attendance" | "passed" | "final_selected">("attendance")
    const [exportColumns, setExportColumns] = useState<string[]>(["usn", "name", "branch", "cgpa", "status", "time"])
    const [isExporting, setIsExporting] = useState(false)

    // Fetch jobs on mount
    useEffect(() => {
        fetchJobs()
    }, [])

    const fetchJobs = async () => {
        try {
            const response = await fetch("/api/admin/jobs?limit=100")
            if (response.ok) {
                const data = await response.json()
                setJobs(data.jobs || [])
            }
        } catch (error) {
            console.error("Error fetching jobs:", error)
        }
    }

    const fetchRounds = useCallback(async (jobId: string) => {
        setIsLoading(true)
        try {
            const response = await fetch(`/api/admin/jobs/${jobId}/rounds`)
            if (response.ok) {
                const data = await response.json()
                setRounds(data.rounds || [])
            }
        } catch (error) {
            console.error("Error fetching rounds:", error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const fetchSessions = useCallback(async (jobId: string) => {
        try {
            const response = await fetch(`/api/admin/jobs/${jobId}/sessions`)
            if (response.ok) {
                const data = await response.json()
                setSessions(data.sessions || [])
            }
        } catch (error) {
            console.error("Error fetching sessions:", error)
        }
    }, [])

    const fetchAttendances = useCallback(async (jobId: string, roundId?: string, status?: string) => {
        try {
            const params = new URLSearchParams()
            if (roundId && roundId !== "ALL") params.set("roundId", roundId)
            if (status && status !== "ALL") params.set("status", status)
            params.set("limit", "500")

            const response = await fetch(`/api/admin/jobs/${jobId}/round-attendance?${params}`)
            if (response.ok) {
                const data = await response.json()
                setAttendances(data.attendances || [])
            }
        } catch (error) {
            console.error("Error fetching attendances:", error)
        }
    }, [])

    const fetchFinalSelections = useCallback(async (jobId: string) => {
        try {
            const response = await fetch(`/api/admin/jobs/${jobId}/final-selected?limit=500`)
            if (response.ok) {
                const data = await response.json()
                setFinalSelections(data.selections || [])
            }
        } catch (error) {
            console.error("Error fetching final selections:", error)
        }
    }, [])

    useEffect(() => {
        if (selectedJobId) {
            fetchRounds(selectedJobId)
            fetchSessions(selectedJobId)
            fetchAttendances(selectedJobId, attendanceRoundId, attendanceStatus)
            fetchFinalSelections(selectedJobId)
        }
    }, [selectedJobId, fetchRounds, fetchSessions, fetchAttendances, fetchFinalSelections, attendanceRoundId, attendanceStatus])

    const handleJobSelect = (jobId: string) => {
        setSelectedJobId(jobId)
        setRounds([])
        setSessions([])
        setAttendances([])
        setFinalSelections([])
        setSelectedAttendances(new Set())
        setAttendanceRoundId("ALL")
        setAttendanceStatus("ALL")
    }

    // ===== Round Management =====
    const createRounds = async () => {
        if (!newRoundNames.trim() || !selectedJobId) return

        const roundNames = newRoundNames.split(",").map(n => n.trim()).filter(Boolean)
        if (roundNames.length === 0) return

        try {
            const existingOrder = rounds.filter(r => !r.isRemoved).length

            for (let i = 0; i < roundNames.length; i++) {
                const response = await fetch(`/api/admin/jobs/${selectedJobId}/rounds`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: roundNames[i], order: existingOrder + i + 1 }),
                })

                if (!response.ok) {
                    const data = await response.json()
                    toast.error(data.error || `Failed to create round "${roundNames[i]}"`)
                    return
                }
            }

            toast.success(`${roundNames.length} round(s) created successfully`)
            setNewRoundNames("")
            setShowCreateRoundDialog(false)
            fetchRounds(selectedJobId)
        } catch (error) {
            toast.error("Failed to create rounds")
        }
    }

    const moveRound = async (roundId: string, direction: "up" | "down") => {
        const activeRounds = rounds.filter(r => !r.isRemoved).sort((a, b) => a.order - b.order)
        const roundIndex = activeRounds.findIndex(r => r.id === roundId)
        if (roundIndex === -1) return

        const swapIndex = direction === "up" ? roundIndex - 1 : roundIndex + 1
        if (swapIndex < 0 || swapIndex >= activeRounds.length) return

        const currentRound = activeRounds[roundIndex]
        const swapRound = activeRounds[swapIndex]

        try {
            await Promise.all([
                fetch(`/api/admin/jobs/${selectedJobId}/rounds`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roundId: currentRound.id, action: "reorder", order: swapRound.order }),
                }),
                fetch(`/api/admin/jobs/${selectedJobId}/rounds`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roundId: swapRound.id, action: "reorder", order: currentRound.order }),
                }),
            ])
            toast.success("Round order updated")
            fetchRounds(selectedJobId)
        } catch (error) {
            toast.error("Failed to reorder rounds")
        }
    }

    // ===== Session Management =====
    const startSession = async () => {
        if (!sessionRoundId || !selectedJobId) {
            toast.error("Please select a round")
            return
        }

        try {
            const startDateTime = new Date(`${sessionDate}T${sessionTime}`)
            
            const response = await fetch(`/api/admin/jobs/${selectedJobId}/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    roundId: sessionRoundId,
                    startTime: startDateTime.toISOString(),
                    duration: sessionDuration,
                }),
            })

            if (response.ok) {
                toast.success("Session started!")
                setShowStartSessionDialog(false)
                setSessionRoundId("")
                fetchRounds(selectedJobId)
                fetchSessions(selectedJobId)
            } else {
                const data = await response.json()
                toast.error(data.error || "Failed to start session")
            }
        } catch (error) {
            toast.error("Failed to start session")
        }
    }

    const updateSession = async (sessionId: string, action: string) => {
        try {
            const response = await fetch(`/api/admin/jobs/${selectedJobId}/sessions`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, action }),
            })

            if (response.ok) {
                const actionLabel =
                    action === "TEMP_CLOSE" ? "paused" :
                    action === "PERM_CLOSE" ? "closed" :
                    "resumed"
                toast.success(`Session ${actionLabel}`)
                fetchRounds(selectedJobId)
                fetchSessions(selectedJobId)
            } else {
                const data = await response.json()
                toast.error(data.error || "Failed to update session")
            }
        } catch (error) {
            toast.error("Failed to update session")
        }
    }

    // ===== QR Scanner =====
    const handleScan = async (qrData: string) => {
        setIsProcessing(true)
        try {
            const response = await fetch("/api/attendance/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qrData, jobId: selectedJobId }),
            })

            const data = await response.json()

            if (response.ok) {
                setScanResult(data)
                toast.success(data.message)
                fetchAttendances(selectedJobId, attendanceRoundId, attendanceStatus)
            } else if (response.status === 409) {
                setScanResult(data)
                toast.warning(data.message)
            } else {
                toast.error(data.error || "Failed to record attendance")
                setScanResult({ success: false, message: data.error || "Error" })
            }
        } catch (error) {
            toast.error("An unexpected error occurred")
            setScanResult({ success: false, message: "Error occurred" })
        } finally {
            setIsProcessing(false)
        }
    }

    // Confirm attendance after QR scan verification
    const confirmAttendance = async () => {
        if (!scanResult?.tokenData) {
            toast.error("No token data available")
            return
        }

        setIsProcessing(true)
        try {
            const response = await fetch("/api/attendance/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(scanResult.tokenData),
            })

            const data = await response.json()

            if (response.ok) {
                setScanResult({
                    ...scanResult,
                    success: true,
                    message: "Attendance marked successfully!",
                    requireConfirmation: false,
                })
                toast.success(data.message || "Attendance confirmed!")
                fetchAttendances(selectedJobId, attendanceRoundId, attendanceStatus)
            } else {
                toast.error(data.error || "Failed to confirm attendance")
            }
        } catch (error) {
            toast.error("An unexpected error occurred")
        } finally {
            setIsProcessing(false)
        }
    }

    // ===== Attendance Management =====
    const toggleSelectAttendance = (id: string) => {
        const newSet = new Set(selectedAttendances)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedAttendances(newSet)
    }

    const selectAllAttendances = () => {
        if (selectedAttendances.size === attendances.length) {
            setSelectedAttendances(new Set())
        } else {
            setSelectedAttendances(new Set(attendances.map(a => a.id)))
        }
    }

    const updateAttendanceStatus = async (status: "PASSED" | "FAILED") => {
        if (selectedAttendances.size === 0) {
            toast.error("No records selected")
            return
        }

        try {
            const response = await fetch(`/api/admin/jobs/${selectedJobId}/round-attendance`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    attendanceIds: Array.from(selectedAttendances),
                    status,
                }),
            })

            if (response.ok) {
                const data = await response.json()
                toast.success(data.message)
                setSelectedAttendances(new Set())
                fetchAttendances(selectedJobId, attendanceRoundId, attendanceStatus)
                fetchFinalSelections(selectedJobId)
            } else {
                const data = await response.json()
                toast.error(data.error || "Failed to update status")
            }
        } catch (error) {
            toast.error("Failed to update status")
        }
    }

    // ===== Excel Export =====
    const handleExport = async () => {
        if (!selectedJobId) return
        
        setIsExporting(true)
        try {
            const response = await fetch(`/api/admin/jobs/${selectedJobId}/export-excel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: exportType,
                    roundId: attendanceRoundId !== "ALL" ? attendanceRoundId : undefined,
                    status: attendanceStatus !== "ALL" ? attendanceStatus : undefined,
                    selectedIds: selectedAttendances.size > 0 ? Array.from(selectedAttendances) : undefined,
                    columns: exportColumns,
                }),
            })

            if (response.ok) {
                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "export.xlsx"
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
                toast.success("Export downloaded successfully")
                setShowExportDialog(false)
            } else {
                const data = await response.json()
                toast.error(data.error || "Export failed")
            }
        } catch (error) {
            toast.error("Export failed")
        } finally {
            setIsExporting(false)
        }
    }

    const toggleExportColumn = (colId: string) => {
        setExportColumns(prev => 
            prev.includes(colId) 
                ? prev.filter(c => c !== colId)
                : [...prev, colId]
        )
    }

    // ===== UI Helpers =====
    const getSessionStatusBadge = (status: string) => {
        switch (status) {
            case "ACTIVE":
                return (
                    <Badge className="bg-emerald-500 text-white border-0 shadow-sm animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 inline-block" />
                        ACTIVE
                    </Badge>
                )
            case "TEMP_CLOSED":
                return <Badge className="bg-amber-500 text-white border-0">PAUSED</Badge>
            case "PERM_CLOSED":
                return <Badge className="bg-red-500 text-white border-0">CLOSED</Badge>
            default:
                return <Badge variant="outline">UNKNOWN</Badge>
        }
    }

    const getAttendanceStatusBadge = (status: string) => {
        switch (status) {
            case "ATTENDED":
                return <Badge className="bg-blue-500 border-0 text-white">Attended</Badge>
            case "PASSED":
                return <Badge className="bg-emerald-500 border-0 text-white">Shortlisted</Badge>
            case "FAILED":
                return <Badge className="bg-red-500 border-0 text-white">Not Shortlisted</Badge>
            default:
                return <Badge variant="outline">{status}</Badge>
        }
    }

    const selectedJob = jobs.find(j => j.id === selectedJobId)
    const activeRounds = rounds.filter(r => !r.isRemoved)
    const activeSessions = sessions.filter(s => s.status === "ACTIVE")

    return (
        <div className="flex flex-1 flex-col gap-4 p-4">
            {/* Header */}
            <div className="flex items-center gap-3 border-b pb-4">
                <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Manage Placement Rounds</h1>
                    <p className="text-sm text-muted-foreground">
                        Create rounds, manage sessions, scan QR codes, and track attendance
                    </p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto w-full space-y-6">
                {/* Job Selector */}
                <Card className="border-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5" />
                            Select Job
                        </CardTitle>
                        <CardDescription>Choose a placement drive to manage</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Select value={selectedJobId} onValueChange={handleJobSelect}>
                            <SelectTrigger className="h-11">
                                <SelectValue placeholder="Select a job..." />
                            </SelectTrigger>
                            <SelectContent>
                                {jobs.map(job => (
                                    <SelectItem key={job.id} value={job.id}>
                                        {job.companyName} - {job.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {selectedJobId && (
                    <Tabs defaultValue="rounds" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="rounds">Rounds</TabsTrigger>
                            <TabsTrigger value="scanner">Scanner</TabsTrigger>
                            <TabsTrigger value="attendance">Attendance</TabsTrigger>
                            <TabsTrigger value="shortlisted">Shortlisted</TabsTrigger>
                            <TabsTrigger value="selected">Final Selected</TabsTrigger>
                        </TabsList>

                        {/* ===== ROUNDS TAB ===== */}
                        <TabsContent value="rounds" className="space-y-4">
                            <div className="flex gap-2 justify-end">
                                <Dialog open={showCreateRoundDialog} onOpenChange={setShowCreateRoundDialog}>
                                    <DialogTrigger asChild>
                                        <Button>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Create Rounds
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Create Rounds</DialogTitle>
                                            <DialogDescription>
                                                Enter round names separated by commas (e.g., &quot;Aptitude, Technical, HR&quot;)
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <Input
                                                placeholder="Round names (comma-separated)"
                                                value={newRoundNames}
                                                onChange={e => setNewRoundNames(e.target.value)}
                                            />
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setShowCreateRoundDialog(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={createRounds} disabled={!newRoundNames.trim()}>
                                                Create
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <Dialog open={showStartSessionDialog} onOpenChange={setShowStartSessionDialog}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline">
                                            <Play className="w-4 h-4 mr-2" />
                                            Start Session
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Start Session</DialogTitle>
                                            <DialogDescription>
                                                Configure and start a new attendance session
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Round</Label>
                                                <Select value={sessionRoundId} onValueChange={setSessionRoundId}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select round..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {activeRounds.map(r => (
                                                            <SelectItem key={r.id} value={r.id}>
                                                                {r.order}. {r.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Date</Label>
                                                    <Input
                                                        type="date"
                                                        value={sessionDate}
                                                        onChange={e => setSessionDate(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Time</Label>
                                                    <Input
                                                        type="time"
                                                        value={sessionTime}
                                                        onChange={e => setSessionTime(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Duration (minutes)</Label>
                                                <Input
                                                    type="number"
                                                    value={sessionDuration}
                                                    onChange={e => setSessionDuration(parseInt(e.target.value) || 60)}
                                                    min={1}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Session will auto-expire after this duration
                                                </p>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setShowStartSessionDialog(false)}>
                                                Cancel
                                            </Button>
                                            <Button onClick={startSession} disabled={!sessionRoundId}>
                                                <Play className="w-4 h-4 mr-2" />
                                                Start
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            {/* Rounds List */}
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                    Loading rounds...
                                </div>
                            ) : activeRounds.length === 0 ? (
                                <Card>
                                    <CardContent className="py-12 text-center">
                                        <p className="text-muted-foreground">No rounds created yet</p>
                                        <Button className="mt-4" onClick={() => setShowCreateRoundDialog(true)}>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Create First Round
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {activeRounds.sort((a, b) => a.order - b.order).map((round, index) => {
                                        const latestSession = round.sessions[0]
                                        return (
                                            <Card key={round.id} className="relative">
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-center justify-between">
                                                        <CardTitle className="text-lg">
                                                            {round.order}. {round.name}
                                                        </CardTitle>
                                                        <div className="flex gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => moveRound(round.id, "up")}
                                                                disabled={index === 0}
                                                            >
                                                                <ArrowUp className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => moveRound(round.id, "down")}
                                                                disabled={index === activeRounds.length - 1}
                                                            >
                                                                <ArrowDown className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Users className="w-4 h-4" />
                                                        {round._count.attendances} attended
                                                    </div>

                                                    {latestSession ? (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                {getSessionStatusBadge(latestSession.status)}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <Clock className="w-3 h-3" />
                                                                Started: {format(new Date(latestSession.startTime), "MMM dd, HH:mm")}
                                                            </div>
                                                            {latestSession.endTime && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    Ends: {format(new Date(latestSession.endTime), "HH:mm")}
                                                                </div>
                                                            )}
                                                            <div className="flex gap-2 pt-2">
                                                                {latestSession.status === "ACTIVE" && (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => updateSession(latestSession.id, "TEMP_CLOSE")}
                                                                        >
                                                                            <Pause className="w-3 h-3 mr-1" />
                                                                            Pause
                                                                        </Button>
                                                                        <AlertDialog>
                                                                            <AlertDialogTrigger asChild>
                                                                                <Button size="sm" variant="destructive">
                                                                                    <StopCircle className="w-3 h-3 mr-1" />
                                                                                    Close
                                                                                </Button>
                                                                            </AlertDialogTrigger>
                                                                            <AlertDialogContent>
                                                                                <AlertDialogHeader>
                                                                                    <AlertDialogTitle>Close Session?</AlertDialogTitle>
                                                                                    <AlertDialogDescription>
                                                                                        This will permanently close the session. You won&apos;t be able to reopen it.
                                                                                    </AlertDialogDescription>
                                                                                </AlertDialogHeader>
                                                                                <AlertDialogFooter>
                                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                    <AlertDialogAction onClick={() => updateSession(latestSession.id, "PERM_CLOSE")}>
                                                                                        Close Session
                                                                                    </AlertDialogAction>
                                                                                </AlertDialogFooter>
                                                                            </AlertDialogContent>
                                                                        </AlertDialog>
                                                                    </>
                                                                )}
                                                                {latestSession.status === "TEMP_CLOSED" && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => updateSession(latestSession.id, "REOPEN")}
                                                                    >
                                                                        <Play className="w-3 h-3 mr-1" />
                                                                        Resume
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">No session started</p>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )
                                    })}
                                </div>
                            )}
                        </TabsContent>

                        {/* ===== SCANNER TAB ===== */}
                        <TabsContent value="scanner" className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <ScanLine className="w-5 h-5" />
                                            QR Code Scanner
                                        </CardTitle>
                                        <CardDescription>
                                            Scan student QR codes to mark attendance
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {activeSessions.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                                <p>No active sessions</p>
                                                <p className="text-sm mt-2">Start a session first to begin scanning</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                                                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                                        {activeSessions.length} active session(s)
                                                    </p>
                                                    {activeSessions.map(s => (
                                                        <p key={s.id} className="text-xs text-muted-foreground">
                                                            {s.round.name} - Started {format(new Date(s.startTime), "HH:mm")}
                                                        </p>
                                                    ))}
                                                </div>
                                                <QRScanner onScan={handleScan} isProcessing={isProcessing} />
                                            </>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Scan Result */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Scan Result</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {scanResult ? (
                                            <div className={`p-4 rounded-lg border-2 ${
                                                scanResult.success 
                                                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" 
                                                    : "border-red-500 bg-red-50 dark:bg-red-950/30"
                                            }`}>
                                                <div className="flex items-center gap-2 mb-4">
                                                    {scanResult.success ? (
                                                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                                                    ) : (
                                                        <XCircle className="w-6 h-6 text-red-500" />
                                                    )}
                                                    <span className="font-medium">{scanResult.message}</span>
                                                </div>

                                                {scanResult.student && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-3">
                                                            {scanResult.student.profilePhoto ? (
                                                                <img
                                                                    src={scanResult.student.profilePhoto}
                                                                    alt=""
                                                                    className="w-16 h-16 rounded-full object-cover border-2"
                                                                />
                                                            ) : (
                                                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                                                    <User className="w-8 h-8 text-muted-foreground" />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="font-semibold text-lg">{scanResult.student.name}</p>
                                                                <p className="text-sm text-muted-foreground">{scanResult.student.usn}</p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-4 h-4 text-muted-foreground" />
                                                                <span className="truncate">{scanResult.student.email}</span>
                                                            </div>
                                                            {scanResult.student.branch && (
                                                                <div className="flex items-center gap-2">
                                                                    <GraduationCap className="w-4 h-4 text-muted-foreground" />
                                                                    <span>{scanResult.student.branch}</span>
                                                                </div>
                                                            )}
                                                            {scanResult.student.phone && (
                                                                <div className="flex items-center gap-2">
                                                                    <Phone className="w-4 h-4 text-muted-foreground" />
                                                                    <span>{scanResult.student.phone}</span>
                                                                </div>
                                                            )}
                                                            {scanResult.student.parentPhone && (
                                                                <div className="flex items-center gap-2">
                                                                    <Phone className="w-4 h-4 text-muted-foreground" />
                                                                    <span>{scanResult.student.parentPhone} (Parent)</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {scanResult.job && (
                                                            <div className="pt-2 border-t">
                                                                <p className="text-sm">
                                                                    <strong>Job:</strong> {scanResult.job.title} at {scanResult.job.company}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {scanResult.round && (
                                                            <p className="text-sm">
                                                                <strong>Round:</strong> {scanResult.round.name}
                                                            </p>
                                                        )}

                                                        {scanResult.scannedAt && (
                                                            <p className="text-xs text-muted-foreground">
                                                                Scanned at: {format(new Date(scanResult.scannedAt), "PPpp")}
                                                            </p>
                                                        )}

                                                        {scanResult.markedAt && (
                                                            <p className="text-xs text-muted-foreground">
                                                                Marked at: {format(new Date(scanResult.markedAt), "PPpp")}
                                                            </p>
                                                        )}

                                                        {/* Mark Attendance Button */}
                                                        {scanResult.requireConfirmation && scanResult.tokenData && (
                                                            <div className="pt-4 border-t mt-4">
                                                                <Button
                                                                    onClick={confirmAttendance}
                                                                    disabled={isProcessing}
                                                                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                                                                    size="lg"
                                                                >
                                                                    {isProcessing ? (
                                                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                                                    ) : (
                                                                        <CheckCircle className="w-5 h-5 mr-2" />
                                                                    )}
                                                                    Mark Attendance
                                                                </Button>
                                                            </div>
                                                        )}

                                                        {/* Already Attended Message */}
                                                        {scanResult.alreadyAttended && (
                                                            <div className="pt-4 border-t mt-4">
                                                                <p className="text-amber-600 text-sm font-medium flex items-center gap-2">
                                                                    <CheckCircle className="w-4 h-4" />
                                                                    Already attended this round
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 text-muted-foreground">
                                                <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                                <p>Scan a QR code to see student details</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* ===== ATTENDANCE TAB ===== */}
                        <TabsContent value="attendance" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div>
                                            <CardTitle>Attendance Records</CardTitle>
                                            <CardDescription>View and manage attendance for each round</CardDescription>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <Select value={attendanceRoundId} onValueChange={setAttendanceRoundId}>
                                                <SelectTrigger className="w-[180px]">
                                                    <SelectValue placeholder="Filter by round" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ALL">All Rounds</SelectItem>
                                                    {activeRounds.map(r => (
                                                        <SelectItem key={r.id} value={r.id}>
                                                            {r.order}. {r.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select value={attendanceStatus} onValueChange={setAttendanceStatus}>
                                                <SelectTrigger className="w-[150px]">
                                                    <SelectValue placeholder="Filter status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ALL">All Status</SelectItem>
                                                    <SelectItem value="ATTENDED">Attended</SelectItem>
                                                    <SelectItem value="PASSED">Passed</SelectItem>
                                                    <SelectItem value="FAILED">Failed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline">
                                                        <Download className="w-4 h-4 mr-2" />
                                                        Export
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-md">
                                                    <DialogHeader>
                                                        <DialogTitle>Export to Excel</DialogTitle>
                                                        <DialogDescription>Select columns and export type</DialogDescription>
                                                    </DialogHeader>
                                                    <div className="space-y-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label>Export Type</Label>
                                                            <Select value={exportType} onValueChange={(v: any) => setExportType(v)}>
                                                                <SelectTrigger>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="attendance">All Attendance</SelectItem>
                                                                    <SelectItem value="passed">Passed Only</SelectItem>
                                                                    <SelectItem value="final_selected">Final Selected</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Columns to Export</Label>
                                                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded">
                                                                {EXPORT_COLUMNS.map(col => (
                                                                    <div key={col.id} className="flex items-center space-x-2">
                                                                        <Checkbox
                                                                            id={col.id}
                                                                            checked={exportColumns.includes(col.id)}
                                                                            onCheckedChange={() => toggleExportColumn(col.id)}
                                                                        />
                                                                        <Label htmlFor={col.id} className="text-sm cursor-pointer">
                                                                            {col.label}
                                                                        </Label>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {selectedAttendances.size > 0 && (
                                                            <p className="text-sm text-muted-foreground">
                                                                Exporting {selectedAttendances.size} selected records
                                                            </p>
                                                        )}
                                                    </div>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                                                            Cancel
                                                        </Button>
                                                        <Button onClick={handleExport} disabled={isExporting || exportColumns.length === 0}>
                                                            {isExporting ? (
                                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                            ) : (
                                                                <FileSpreadsheet className="w-4 h-4 mr-2" />
                                                            )}
                                                            Export
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {selectedAttendances.size > 0 && (
                                        <div className="flex gap-2 mb-4 p-3 bg-muted rounded-lg">
                                            <span className="text-sm font-medium">{selectedAttendances.size} selected</span>
                                            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => updateAttendanceStatus("PASSED")}>
                                                <ThumbsUp className="w-3 h-3 mr-1" />
                                                Shortlist for Next Round
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => updateAttendanceStatus("FAILED")}>
                                                <ThumbsDown className="w-3 h-3 mr-1" />
                                                Not Shortlisted
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => setSelectedAttendances(new Set())}>
                                                Clear
                                            </Button>
                                        </div>
                                    )}

                                    {attendances.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                            <p>No attendance records found</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b bg-muted/30">
                                                        <th className="p-3 text-left">
                                                            <Checkbox
                                                                checked={selectedAttendances.size === attendances.length && attendances.length > 0}
                                                                onCheckedChange={selectAllAttendances}
                                                            />
                                                        </th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Student</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">USN</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Branch</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">CGPA</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Round</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attendances.map(a => (
                                                        <tr key={a.id} className="border-b hover:bg-muted/20 transition-colors">
                                                            <td className="p-3">
                                                                <Checkbox
                                                                    checked={selectedAttendances.has(a.id)}
                                                                    onCheckedChange={() => toggleSelectAttendance(a.id)}
                                                                />
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="flex items-center gap-3">
                                                                    {a.profile?.profilePhoto ? (
                                                                        <img
                                                                            src={a.profile.profilePhoto}
                                                                            alt=""
                                                                            className="w-8 h-8 rounded-full object-cover border"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                                                            <User className="w-4 h-4 text-muted-foreground" />
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p className="font-medium text-sm">{a.user.name || `${a.profile?.firstName || ""} ${a.profile?.lastName || ""}`}</p>
                                                                        <p className="text-xs text-muted-foreground">{a.user.email}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 font-mono text-sm">{a.profile?.usn || "—"}</td>
                                                            <td className="p-3 text-sm">{a.profile?.branch || "—"}</td>
                                                            <td className="p-3 text-sm">{(a.profile?.finalCgpa || a.profile?.cgpa)?.toFixed(2) || "—"}</td>
                                                            <td className="p-3 text-sm">{a.round.name}</td>
                                                            <td className="p-3">{getAttendanceStatusBadge(a.status)}</td>
                                                            <td className="p-3 text-sm text-muted-foreground">{format(new Date(a.markedAt), "HH:mm")}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ===== SHORTLISTED TAB ===== */}
                        <TabsContent value="shortlisted" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                Shortlisted Students
                                            </CardTitle>
                                            <CardDescription>Students who passed each round</CardDescription>
                                        </div>
                                        <Select value={attendanceRoundId} onValueChange={setAttendanceRoundId}>
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Filter by round" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Rounds</SelectItem>
                                                {activeRounds.map(r => (
                                                    <SelectItem key={r.id} value={r.id}>
                                                        {r.order}. {r.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {(() => {
                                        const passed = attendances.filter(a => a.status === "PASSED")
                                        if (passed.length === 0) {
                                            return (
                                                <div className="text-center py-12 text-muted-foreground">
                                                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                                    <p>No shortlisted students yet</p>
                                                </div>
                                            )
                                        }
                                        return (
                                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                                {passed.map(a => (
                                                    <div key={a.id} className="p-4 border rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200">
                                                        <div className="flex items-center gap-3">
                                                            {a.profile?.profilePhoto ? (
                                                                <img
                                                                    src={a.profile.profilePhoto}
                                                                    alt=""
                                                                    className="w-12 h-12 rounded-full object-cover border-2 border-emerald-300"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                                                                    <User className="w-6 h-6 text-emerald-600" />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="font-semibold">{a.user.name}</p>
                                                                <p className="text-sm text-muted-foreground">{a.profile?.usn}</p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
                                                            <span className="text-muted-foreground">Branch:</span>
                                                            <span>{a.profile?.branch || "—"}</span>
                                                            <span className="text-muted-foreground">CGPA:</span>
                                                            <span>{(a.profile?.finalCgpa || a.profile?.cgpa)?.toFixed(2) || "—"}</span>
                                                            <span className="text-muted-foreground">Round:</span>
                                                            <span>{a.round.name}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })()}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ===== FINAL SELECTED TAB ===== */}
                        <TabsContent value="selected" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <Trophy className="w-5 h-5 text-amber-500" />
                                                Final Selected Students
                                            </CardTitle>
                                            <CardDescription>
                                                Students selected for placements (auto-created when passed final round)
                                            </CardDescription>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setExportType("final_selected")
                                                setShowExportDialog(true)
                                            }}
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Export
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {finalSelections.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                            <p>No final selections yet</p>
                                            <p className="text-sm mt-2">
                                                Students are auto-selected when they pass the final round
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b bg-muted/30">
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Student</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">USN</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Branch</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Batch</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Package</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tier</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Role</th>
                                                        <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase">Selected At</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {finalSelections.map(s => (
                                                        <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                                                            <td className="p-3">
                                                                <div className="flex items-center gap-3">
                                                                    {s.profile?.profilePhoto ? (
                                                                        <img
                                                                            src={s.profile.profilePhoto}
                                                                            alt=""
                                                                            className="w-8 h-8 rounded-full object-cover border"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                                                                            <Trophy className="w-4 h-4 text-amber-600" />
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p className="font-medium text-sm">{s.user.name}</p>
                                                                        <p className="text-xs text-muted-foreground">{s.user.email}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 font-mono text-sm">{s.usn || s.profile?.usn || "—"}</td>
                                                            <td className="p-3 text-sm">{s.profile?.branch || "—"}</td>
                                                            <td className="p-3 text-sm">{s.year || s.profile?.batch || "—"}</td>
                                                            <td className="p-3 text-sm font-semibold text-emerald-600">
                                                                {s.package ? `₹${s.package} LPA` : "—"}
                                                            </td>
                                                            <td className="p-3">
                                                                <Badge variant="outline">{s.tier.replace("_", " ")}</Badge>
                                                            </td>
                                                            <td className="p-3 text-sm">{s.role || "—"}</td>
                                                            <td className="p-3 text-sm text-muted-foreground">
                                                                {format(new Date(s.selectedAt), "MMM dd, yyyy")}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
