"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { requestPermissionAndGetToken } from "@/lib/firebase"

/**
 * FCMTokenRegistrar
 *
 * Invisible component that runs once when a user logs in.
 * It requests notification permission, gets the FCM token,
 * and saves it to the server so the admin can send push
 * notifications to this device.
 *
 * Place this inside <SessionProvider> in the root layout.
 */
export default function FCMTokenRegistrar() {
    const { data: session, status } = useSession()

    useEffect(() => {
        // Only run when the user is authenticated
        if (status !== "authenticated" || !session?.user?.id) return

        const registerFCMToken = async () => {
            try {
                const token = await requestPermissionAndGetToken()
                if (!token) return

                // Save the token to the server
                const res = await fetch("/api/push/fcm-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token })
                })

                if (!res.ok) {
                    const err = await res.json()
                    console.warn("FCM token save failed:", err)
                }
            } catch (err) {
                // Don't surface errors to the user — push is non-critical
                console.warn("FCM token registration error:", err)
            }
        }

        registerFCMToken()
        // Re-run only when the user identity changes
    }, [session?.user?.id, status])

    // Renders nothing
    return null
}
