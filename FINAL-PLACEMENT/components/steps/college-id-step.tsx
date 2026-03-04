"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentUpload } from "@/components/ui/document-upload"
import { AlertCircle, Upload, CheckCircle, ArrowLeft, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CollegeIdStepProps {
  onNext: (data: any) => void
  onPrevious: () => void
  onSave: (data: any) => void
  isSaving?: boolean
  initialData?: any
}

export function CollegeIdStep({ onNext, onPrevious, onSave, isSaving, initialData = {} }: CollegeIdStepProps) {
  const [collegeIdCard, setCollegeIdCard] = useState<File | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(initialData.collegeIdCard || null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string>("")

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setCollegeIdCard(null)
      return
    }

    setError("")
    setCollegeIdCard(file)

    // Upload file immediately
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "college-id-card")
      // Also include folder for backward compatibility
      formData.append("folder", "college-id-cards")

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to upload file" }))
        throw new Error(errorData.error || "Failed to upload file")
      }

      const data = await response.json()
      if (data.url) {
        setUploadedUrl(data.url)
        setError("") // Clear any previous errors
      } else {
        throw new Error("No URL returned from upload")
      }
    } catch (err) {
      console.error("Error uploading file:", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to upload file. Please try again."
      setError(errorMessage)
      setCollegeIdCard(null)
      setUploadedUrl(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleNext = () => {
    if (!uploadedUrl && !collegeIdCard) {
      setError("Please upload your College ID card to continue")
      return
    }

    onNext({
      collegeIdCard: uploadedUrl
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          College ID Card Upload
        </CardTitle>
        <CardDescription>
          Upload a clear photo or scan of your College ID card. This is required for KYC verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <DocumentUpload
            label="College ID Card"
            description="Upload a clear, readable image of your College ID card (JPG, PNG, or PDF, max 10MB)"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            maxSizeMB={10}
            required
            error={error}
            initialFile={uploadedUrl ? { url: uploadedUrl, name: "College ID Card" } : undefined}
            onFileChange={handleFileChange}
            placeholder="Drop your College ID card here or click to select"
          />

          {uploadedUrl && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                College ID uploaded successfully! Your profile is now complete and verified. You can now apply to jobs!
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Requirements:
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-300 list-disc list-inside space-y-1">
              <li>Clear, readable image of your College ID card</li>
              <li>All information should be visible</li>
              <li>File size should not exceed 10MB</li>
              <li>Accepted formats: JPG, PNG, PDF</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-between items-center pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous Step
          </Button>
          <Button
            onClick={handleNext}
            size="lg"
            className="px-8 h-11 text-sm font-medium tracking-[-0.01em]"
            disabled={!uploadedUrl && !collegeIdCard || isUploading}
          >
            {isUploading ? "Uploading..." : "Next Step"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}


