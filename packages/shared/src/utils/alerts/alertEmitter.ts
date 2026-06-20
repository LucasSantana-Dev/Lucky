const COLOR: Record<string, number> = {
    danger: 0xed4245,
    warning: 0xfee75c,
    info: 0x5865f2,
}

export type AlertColor = 'danger' | 'warning' | 'info'

export type AlertPayload = {
    title: string
    description: string
    color?: AlertColor
    fields?: Array<{ name: string; value: string }>
}

/**
 * Posts an alert embed to the configured Discord webhook.
 * No-op when DISCORD_ALERT_WEBHOOK is unset. Never throws.
 */
export async function emitAlert(payload: AlertPayload): Promise<void> {
    const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK
    if (!webhookUrl) return

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [
                    {
                        title: payload.title,
                        description: payload.description,
                        color: COLOR[payload.color ?? 'danger'],
                        fields: payload.fields ?? [],
                        timestamp: new Date().toISOString(),
                    },
                ],
            }),
            signal: AbortSignal.timeout(5_000),
        })
        if (!res.ok) throw new Error(`Webhook ${res.status}`)
    } catch {
        // Fire-and-forget — a failed alert must never crash the caller
    }
}
