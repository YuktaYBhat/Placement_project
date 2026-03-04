"use client"

import { FileIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface BulkNotificationViewProps {
    message: string
    data: {
        attachments?: { url: string; name: string }[]
    }
    files?: { id: string; fileUrl: string; fileName: string }[]
}

export function BulkNotificationView({ message, data, files }: BulkNotificationViewProps) {
    const legacyAttachments = data?.attachments || []
    const normalizedFiles = files?.map(f => ({ url: f.fileUrl, name: f.fileName })) || []
    const attachments = [...legacyAttachments, ...normalizedFiles]

    const handleDownload = (url: string, filename: string) => {
        // Direct download via window.open is more robust for cross-origin R2 URLs
        // and avoids the "Failed to fetch" CORS errors.
        window.open(url, '_blank')
    }

    return (
        <div className="space-y-6">
            {/* Message Text - Increased size and improved readability */}
            <div className="text-base sm:text-lg whitespace-pre-wrap leading-relaxed text-foreground/90 px-1 border-l-4 border-primary/20 pl-4 py-1 italic">
                {message}
            </div>

            {/* Attachments Section */}
            {attachments && attachments.length > 0 && (
                <div className="space-y-3 mt-8 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="flex items-center gap-2 px-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Attached Documents ({attachments.length})
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {attachments.map((file: any, i: number) => (
                            <Card key={i} className="group hover:ring-2 hover:ring-primary/20 transition-all border-dashed bg-muted/30 hover:bg-background shadow-sm hover:shadow-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="bg-primary/10 group-hover:bg-primary/20 p-2.5 rounded-xl transition-colors">
                                                <FileIcon className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors" title={file.name}>
                                                    {file.name}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                                    {file.name.split('.').pop()} Document
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 shrink-0 rounded-lg hover:bg-primary hover:text-primary-foreground border-primary/20"
                                            onClick={() => handleDownload(file.url, file.name)}
                                        >
                                            Download
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
