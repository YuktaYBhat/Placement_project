import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, sanitizeInput, logSecurityEvent } from "@/lib/auth-helpers"
import { emitNotification } from "@/lib/socket"
import { randomUUID } from "crypto"
import { sendCustomFCMNotifications } from "@/lib/firebase-admin"

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const { error, session } = await requireAdmin()

    if (error || !session) {
      logSecurityEvent("unauthorized_admin_access", {
        endpoint: "/api/admin/bulk-notifications",
        ip: request.headers.get("x-forwarded-for") || "unknown"
      })
      return error
    }

    const {
      subject,
      message,
      targetGroup,
      selectedBranches,
      attachments,
      adminId
    } = await request.json()

    console.log("DEBUG: Bulk notification request received:", { subject, attachmentCount: attachments?.length || 0 })

    // Input validation
    if (!subject || !message || !adminId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Verify adminId matches session
    if (adminId !== session.user.id) {
      logSecurityEvent("admin_id_mismatch", {
        sessionUserId: session.user.id,
        providedAdminId: adminId
      })
      return NextResponse.json(
        { error: "Invalid admin ID" },
        { status: 403 }
      )
    }

    // Sanitize inputs
    const sanitizedSubject = sanitizeInput(subject)
    const sanitizedMessage = sanitizeInput(message)

    // Validate subject and message length
    if (sanitizedSubject.length > 200 || sanitizedMessage.length > 5000) {
      return NextResponse.json(
        { error: "Subject or message too long" },
        { status: 400 }
      )
    }

    // Validate targetGroup
    const validTargetGroups = ['all', 'branches']
    if (!validTargetGroups.includes(targetGroup)) {
      return NextResponse.json(
        { error: "Invalid target group" },
        { status: 400 }
      )
    }

    // Build the user filter based on targeting options
    let userFilter: any = { role: 'STUDENT' }

    if (targetGroup === 'branches' && Array.isArray(selectedBranches) && selectedBranches.length > 0) {
      userFilter.profile = {
        branch: { in: selectedBranches }
      }
    }

    // Get target users
    const targetUsers = await prisma.user.findMany({
      where: userFilter,
      select: {
        id: true,
        email: true,
        name: true
      }
    })

    // Log the notification attempt
    logSecurityEvent("bulk_notification_sent", {
      adminId: session.user.id,
      recipientCount: targetUsers.length,
      targetGroup,
      timestamp: new Date().toISOString()
    })

    // Create notifications for each target user
    if (targetUsers.length > 0) {
      const notificationsData = targetUsers.map((user: { id: string; name: string | null }) => {
        const id = randomUUID()
        return {
          id,
          userId: user.id,
          title: sanitizedSubject,
          message: sanitizedMessage,
          type: 'SYSTEM' as const,
          isRead: false,
          scheduledAt: null,
          data: {
            sentBy: adminId,
            targetGroup,
            isEmitted: true,
          }
        }
      })

      const filesData: any[] = []
      notificationsData.forEach(notif => {
        if (attachments && attachments.length > 0) {
          attachments.forEach((file: { url: string; name: string }) => {
            filesData.push({
              notificationId: notif.id,
              fileName: file.name,
              fileUrl: file.url
            })
          })
        }
      })

      // Create all notifications and their files in a transaction
      await prisma.$transaction([
        prisma.notification.createMany({
          data: notificationsData
        }),
        prisma.notificationFile.createMany({
          data: filesData
        })
      ])

      // Emit real-time notifications immediately
      notificationsData.forEach((notification: any) => {
        emitNotification(notification.userId, {
          ...notification,
          createdAt: new Date().toISOString()
        })
      })

      // Send FCM push notifications (desktop & Android)
      try {
        const usersWithTokens = await (prisma.user as any).findMany({
          where: {
            id: { in: targetUsers.map((u: { id: string }) => u.id) },
            fcmToken: { not: null }
          },
          select: { id: true, fcmToken: true }
        })

        if (usersWithTokens.length > 0) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3500'

          // Create a map of userId -> notificationId for quick lookup
          const userNotifMap = new Map(
            notificationsData.map((n: any) => [n.userId, n.id])
          )

          const fcmMessages = usersWithTokens.map((u: any) => {
            const notificationId = userNotifMap.get(u.id)
            return {
              token: u.fcmToken,
              title: sanitizedSubject,
              body: sanitizedMessage,
              data: { targetGroup, notificationId },
              link: `${appUrl}/notifications/${notificationId}`
            }
          })

          const fcmResponse = await sendCustomFCMNotifications(fcmMessages)

          // Clean up stale tokens
          if (fcmResponse && fcmResponse.responses) {
            const staleTokens: string[] = []
            fcmResponse.responses.forEach((resp: any, idx: number) => {
              if (!resp.success) {
                const code = resp.error?.code
                if (
                  code === 'messaging/registration-token-not-registered' ||
                  code === 'messaging/invalid-registration-token'
                ) {
                  staleTokens.push(fcmMessages[idx].token)
                }
              }
            })
            if (staleTokens.length > 0) {
              await (prisma.user as any).updateMany({
                where: { fcmToken: { in: staleTokens } },
                data: { fcmToken: null }
              })
              console.log(`Cleared ${staleTokens.length} stale FCM tokens`)
            }
          }

          console.log(`FCM push sent to ${fcmMessages.length} devices for bulk notification`)
        }
      } catch (fcmError) {
        // FCM errors should not fail the whole request
        console.error("Error sending FCM push for bulk notification:", fcmError)
      }

      console.log(`Bulk notification sent to ${targetUsers.length} users`)
    }

    return NextResponse.json({
      success: true,
      recipientCount: targetUsers.length,
      message: "Notification sent successfully"
    })

  } catch (error) {
    console.error("Error sending bulk notification:", error)
    logSecurityEvent("bulk_notification_error", {
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
