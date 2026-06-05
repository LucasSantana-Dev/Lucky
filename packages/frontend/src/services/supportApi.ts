import type { AxiosInstance } from 'axios'

/** A support report row as returned by the admin list endpoint (no image bytes). */
export interface SupportReportListItem {
    id: string
    createdAt: string
    context: string
    imageMimeType: string | null
    correlationId: string | null
    guildId: string | null
    surface: string
    errorCategory: string | null
    status: string
}

/** Admin report detail — list fields plus a `hasImage` flag (bytes fetched separately). */
export interface SupportReportDetail extends SupportReportListItem {
    rateLimitKey: string | null
    hasImage: boolean
}

export interface ListAdminReportsParams {
    status?: string
    take?: number
    cursor?: string
}

/**
 * Support report API surface. The public submit uses `fetch` (multipart, no auth
 * needed) so the browser sets the multipart boundary; admin reads use the
 * credentialed axios client.
 */
export function createSupportApi(client: AxiosInstance, apiBase: string) {
    return {
        /** Public: submit a bug report (multipart). Throws on non-2xx with the server message. */
        submit: async (formData: FormData): Promise<{ id: string }> => {
            const res = await fetch(`${apiBase}/support`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            })
            if (!res.ok) {
                let message = 'Failed to submit your report. Please try again.'
                try {
                    const body = (await res.json()) as { error?: string }
                    if (body.error) message = body.error
                } catch {
                    // non-JSON error body — keep the default message
                }
                throw new Error(message)
            }
            return (await res.json()) as { id: string }
        },

        /** Admin: list reports (newest first), optionally filtered by status. */
        listAdmin: async (
            params?: ListAdminReportsParams,
        ): Promise<SupportReportListItem[]> => {
            const res = await client.get<SupportReportListItem[]>(
                '/admin/support',
                { params },
            )
            return res.data
        },

        /** Admin: a single report's metadata (no image bytes). */
        getAdmin: async (id: string): Promise<SupportReportDetail> => {
            const res = await client.get<SupportReportDetail>(
                `/admin/support/${id}`,
            )
            return res.data
        },

        /** Admin: URL for a report's image bytes (same-origin, credentialed). */
        imageUrl: (id: string): string =>
            `${apiBase}/admin/support/${id}/image`,
    }
}
