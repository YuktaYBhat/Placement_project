"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Camera, CameraOff } from "lucide-react"
import jsQR from "jsqr"

interface QRScannerProps {
    onScan: (data: string) => void
    isProcessing?: boolean
}

export function QRScanner({ onScan, isProcessing = false }: QRScannerProps) {
    const [isActive, setIsActive] = useState(false)
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [lastScanned, setLastScanned] = useState<string | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const scanningRef = useRef(false)

    const startCamera = async () => {
        try {
            console.log("Starting camera...")
            
            // Try to get the back camera first
            let stream: MediaStream
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                })
            } catch (e) {
                console.log("Back camera failed, trying any camera:", e)
                // Fall back to any available camera
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                })
            }

            console.log("Got stream:", stream)
            streamRef.current = stream
            setHasPermission(true)

            if (videoRef.current) {
                videoRef.current.srcObject = stream
                
                // Wait for metadata to load before playing
                videoRef.current.onloadedmetadata = async () => {
                    console.log("Video metadata loaded:", {
                        width: videoRef.current?.videoWidth,
                        height: videoRef.current?.videoHeight
                    })
                    
                    try {
                        await videoRef.current?.play()
                        console.log("Video playing")
                        setIsActive(true)
                        scanningRef.current = true
                        requestAnimationFrame(scanFrame)
                    } catch (playError) {
                        console.error("Play error:", playError)
                        toast.error("Could not start video playback")
                    }
                }
            }
        } catch (error) {
            console.error("Camera error:", error)
            setHasPermission(false)
            toast.error("Could not access camera. Please grant camera permission.")
        }
    }

    const scanFrame = () => {
        if (!scanningRef.current || !videoRef.current || !canvasRef.current) {
            console.log("Scan frame early return:", { 
                scanning: scanningRef.current, 
                video: !!videoRef.current, 
                canvas: !!canvasRef.current 
            })
            return
        }

        const video = videoRef.current
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { willReadFrequently: true })

        if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight
            canvas.width = video.videoWidth
            context.drawImage(video, 0, 0, canvas.width, canvas.height)

            try {
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
                // Log every 60 frames to avoid console spam
                if (Math.random() < 0.016) {
                    console.log("Scanning frame:", { width: imageData.width, height: imageData.height })
                }
                
                // Try multiple inversion attempts for better detection
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "attemptBoth",
                })

                if (code && code.data && !isProcessing) {
                    // Prevent duplicate scans
                    if (lastScanned !== code.data) {
                        console.log("QR Code detected:", code.data)
                        setLastScanned(code.data)
                        onScan(code.data)
                        
                        // Reset after 3 seconds
                        setTimeout(() => setLastScanned(null), 3000)
                    }
                }
            } catch (e) {
                console.error("QR decode error:", e)
            }
        } else {
            console.log("Video not ready:", video.readyState)
        }

        if (scanningRef.current) {
            requestAnimationFrame(scanFrame)
        }
    }

    const stopCamera = () => {
        console.log("Stopping camera...")
        scanningRef.current = false
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop()
                console.log("Track stopped:", track.kind)
            })
            streamRef.current = null
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
        setIsActive(false)
        setLastScanned(null)
    }

    useEffect(() => {
        return () => {
            stopCamera()
        }
    }, [])

    // Manual input for testing
    const [manualInput, setManualInput] = useState("")

    const handleManualSubmit = () => {
        if (manualInput.trim()) {
            onScan(manualInput.trim())
            setManualInput("")
        }
    }

    return (
        <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-4 border-dashed border-muted-foreground/20">
                <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`}
                    playsInline
                    muted
                    autoPlay
                    webkit-playsinline="true"
                />
                
                {!isActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted">
                        <Camera className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-sm">Click "Start Camera" to begin scanning</p>
                    </div>
                )}
                
                {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative w-48 h-48 md:w-64 md:h-64">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg" />
                        </div>
                    </div>
                )}
                
                {isProcessing && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-white">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
                            <p className="text-sm">Processing...</p>
                        </div>
                    </div>
                )}
                
                <canvas ref={canvasRef} className="hidden" />
            </div>

            <Button 
                onClick={isActive ? stopCamera : startCamera} 
                variant={isActive ? "destructive" : "default"}
                className="w-full"
                size="lg"
            >
                {isActive ? (
                    <>
                        <CameraOff className="w-4 h-4 mr-2" />
                        Stop Camera
                    </>
                ) : (
                    <>
                        <Camera className="w-4 h-4 mr-2" />
                        Start Camera
                    </>
                )}
            </Button>

            {/* Manual Input (for testing without camera) */}
            <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Manual Entry (for testing):</p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        className="flex-1 px-3 py-2 border rounded-md text-sm"
                        placeholder="Paste application ID or QR data..."
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                    />
                    <Button onClick={handleManualSubmit} disabled={isProcessing || !manualInput.trim()}>
                        Submit
                    </Button>
                </div>
            </div>

            {hasPermission === false && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                    Camera permission denied. Please allow camera access in your browser settings and refresh the page.
                </div>
            )}
        </div>
    )
}
