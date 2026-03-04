import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getFileFromR2 } from "@/lib/r2-storage"
import { Readable } from "stream"

export async function GET(req: NextRequest) {
    try {
        const session = await auth()

        // 1. Protect behind admin authentication
        if (!session?.user) {
            return new NextResponse("Not authenticated", { status: 401 })
        }

        if (session.user.role !== "ADMIN") {
            return new NextResponse("Unauthorized", { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const key = searchParams.get("key")

        if (!key) {
            return new NextResponse("Missing file key", { status: 400 })
        }

        // 2. Get file from R2
        const { body, contentType, contentLength } = await getFileFromR2(key)

        if (!body) {
            return new NextResponse("File not found", { status: 404 })
        }

        // 3. Construct the response with proper streaming
        // AWS SDK Body is a Readable stream in Node.js
        const readable = body as Readable

        // Convert Node.js Readable to Web ReadableStream for NextResponse
        const stream = new ReadableStream({
            start(controller) {
                readable.on("data", (chunk) => controller.enqueue(chunk))
                readable.on("end", () => controller.close())
                readable.on("error", (err) => controller.error(err))
            },
            cancel() {
                readable.destroy()
            }
        })

        const response = new NextResponse(stream)

        // Pass along important headers
        if (contentType) response.headers.set("Content-Type", contentType)
        if (contentLength) response.headers.set("Content-Length", contentLength.toString())

        // Set cache control for security - highly private data
        response.headers.set("Cache-Control", "no-store, max-age=0")

        return response

    } catch (error: any) {
        console.error("[DOCUMENT_DOWNLOAD_ERROR]", error)
        if (error.Code === "NoSuchKey") {
            return new NextResponse("Document not found in storage", { status: 404 })
        }
        return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 })
    }
}
