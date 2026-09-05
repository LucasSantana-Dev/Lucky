import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { reportError } from '@/lib/sentry'
import { api } from '@/services/api'

interface ForumThreadCtaProps {
    guildId: string
    slug: string
}

// Renders a link to the guide's official Discord discussion thread, when one
// is mapped for this guild. Hidden when no thread is mapped (404) or on any
// other lookup failure.
export default function ForumThreadCta({ guildId, slug }: ForumThreadCtaProps) {
    const [url, setUrl] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        setUrl(null)

        api.forum
            .getThread(guildId, slug)
            .then((thread) => {
                if (mounted) setUrl(thread?.url ?? null)
            })
            .catch((error) => {
                if (!mounted) return
                reportError('Failed to load forum thread:', error, {
                    component: 'ForumThreadCta',
                    action: 'getThread',
                })
                setUrl(null)
            })

        return () => {
            mounted = false
        }
    }, [guildId, slug])

    if (!url) return null

    return (
        <a
            href={url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-2 self-start rounded-lg border border-lucky-border bg-lucky-bg-active px-3 py-1.5 type-body-sm text-lucky-text-secondary transition-colors hover:bg-lucky-border hover:text-lucky-text-primary'
        >
            <MessageSquare className='h-4 w-4' aria-hidden='true' />
            Ver discussão no Discord
        </a>
    )
}
