import { useMemo, useState } from 'react'
import changelogMd from '../../../../CHANGELOG.md?raw'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'
import PublicHeader from '@/components/DocsShell/PublicHeader'
import { useActiveHeading } from '@/hooks/useActiveHeading'

type ChangelogSection = {
    heading: string
    items: string[]
}

type ChangelogEntry = {
    version: string
    date: string | null
    sections: ChangelogSection[]
}

function parseChangelog(md: string): ChangelogEntry[] {
    const lines = md.split('\n')
    const entries: ChangelogEntry[] = []

    let current: ChangelogEntry | null = null
    let currentSection: ChangelogSection | null = null

    const versionRegex = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/
    const sectionRegex = /^###\s+(.+)/
    const bulletRegex = /^[-*]\s+(.+)/

    for (const raw of lines) {
        const line = raw.trimEnd()
        const v = line.match(versionRegex)
        if (v) {
            if (current) entries.push(current)
            current = { version: v[1], date: v[2] ?? null, sections: [] }
            currentSection = null
            continue
        }
        if (!current) continue
        const s = line.match(sectionRegex)
        if (s) {
            currentSection = { heading: s[1].trim(), items: [] }
            current.sections.push(currentSection)
            continue
        }
        const b = line.match(bulletRegex)
        if (b && currentSection) {
            currentSection.items.push(b[1].trim())
        }
    }
    if (current) entries.push(current)

    return entries.filter((e) => e.sections.some((s) => s.items.length > 0))
}

function formatDate(date: string | null): string {
    if (!date) return ''
    const d = new Date(date + 'T00:00:00Z')
    if (Number.isNaN(d.getTime())) return date
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

function renderInlineMd(text: string): React.ReactNode {
    const parts: React.ReactNode[] = []
    const codeSplit = text.split(/(`[^`]+`)/g)
    codeSplit.forEach((chunk, ci) => {
        if (chunk.startsWith('`') && chunk.endsWith('`')) {
            parts.push(
                <code
                    key={`c-${ci}`}
                    className='rounded bg-lucky-surface-elevated border border-lucky-border-soft px-1.5 py-0.5 font-mono text-[0.84em] text-lucky-text-strong'
                >
                    {chunk.slice(1, -1)}
                </code>,
            )
            return
        }
        const prSplit = chunk.split(/(#\d{2,5})/g)
        prSplit.forEach((p, pi) => {
            const m = p.match(/^#(\d{2,5})$/)
            if (m) {
                parts.push(
                    <a
                        key={`p-${ci}-${pi}`}
                        href={`https://github.com/LucasSantana-Dev/Lucky/pull/${m[1]}`}
                        target='_blank'
                        rel='noreferrer'
                        className='font-mono text-lucky-brand hover:underline'
                    >
                        #{m[1]}
                    </a>,
                )
            } else if (p) {
                parts.push(p)
            }
        })
    })
    return parts
}

const sectionStyles: Record<string, string> = {
    Added: 'text-lucky-brand',
    Changed: 'text-amber-400',
    Fixed: 'text-emerald-400',
    Internal: 'text-lucky-text-muted',
    Removed: 'text-rose-400',
    Security: 'text-rose-400',
    Deprecated: 'text-amber-400',
}

export default function ChangelogPage() {
    usePageMetadata(metaFor('/changelog'))

    const entries = useMemo(() => parseChangelog(changelogMd), [])
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const ids = useMemo(() => entries.map((e) => `v-${e.version}`), [entries])
    const activeId = useActiveHeading(ids)
    const activeVersion = activeId ? activeId.replace(/^v-/, '') : null

    return (
        <div className='min-h-screen bg-lucky-surface-canvas text-white'>
            <PublicHeader
                breadcrumb='Changelog'
                activeNav='changelog'
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />

            <div className='mx-auto grid max-w-7xl gap-0 px-0 md:px-6 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]'>
                <aside
                    className={`${sidebarOpen ? 'block' : 'hidden'} lg:block border-r border-lucky-border-soft bg-lucky-surface-canvas`}
                    aria-label='Version navigation'
                >
                    <div className='sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-8 md:px-6'>
                        <h4 className='mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                            Versions
                        </h4>
                        <ul className='space-y-0.5'>
                            {entries.map((e) => {
                                const active = activeVersion === e.version
                                return (
                                    <li key={e.version}>
                                        <a
                                            href={`#v-${e.version}`}
                                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${active ? 'bg-lucky-surface-panel text-lucky-text-strong shadow-[inset_2px_0_0_var(--color-lucky-brand)]' : 'text-lucky-text-body hover:bg-lucky-surface-panel hover:text-lucky-text-strong'}`}
                                        >
                                            <span className='font-mono'>
                                                {e.version}
                                            </span>
                                            {e.date ? (
                                                <span className='font-mono text-[10px] text-lucky-text-muted'>
                                                    {e.date.slice(0, 7)}
                                                </span>
                                            ) : null}
                                        </a>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </aside>

                <main className='min-w-0 px-4 py-10 md:px-8 md:py-14 lg:px-10'>
                    <article className='mx-auto max-w-2xl'>
                        <header className='mb-10 border-b border-lucky-border-soft pb-6'>
                            <p className='mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                                Releases
                            </p>
                            <h1 className='text-3xl font-bold tracking-tight text-lucky-text-strong md:text-4xl'>
                                Changelog
                            </h1>
                            <p className='mt-3 text-sm text-lucky-text-body'>
                                Notable changes per release. Source of truth:{' '}
                                <a
                                    className='text-lucky-brand hover:underline'
                                    href='https://github.com/LucasSantana-Dev/Lucky/blob/main/CHANGELOG.md'
                                    target='_blank'
                                    rel='noreferrer'
                                >
                                    CHANGELOG.md
                                </a>
                                .
                            </p>
                        </header>

                        <div className='relative'>
                            <div
                                aria-hidden
                                className='absolute left-2 top-2 bottom-2 w-px bg-lucky-border-soft'
                            />
                            <div className='space-y-12'>
                                {entries.map((entry) => (
                                    <section
                                        key={entry.version}
                                        id={`v-${entry.version}`}
                                        className='relative pl-8 scroll-mt-20'
                                    >
                                        <span
                                            aria-hidden
                                            className='absolute left-[3px] top-2.5 h-2.5 w-2.5 rounded-full bg-lucky-brand ring-4 ring-lucky-surface-canvas'
                                        />
                                        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                                            <h2 className='font-mono text-xl font-semibold text-lucky-text-strong'>
                                                v{entry.version}
                                            </h2>
                                            {entry.date ? (
                                                <span className='font-mono text-xs text-lucky-text-muted'>
                                                    {formatDate(entry.date)}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className='mt-5 space-y-6'>
                                            {entry.sections.map((section) =>
                                                section.items.length ===
                                                0 ? null : (
                                                    <div key={section.heading}>
                                                        <h3
                                                            className={`mb-2 font-mono text-[11px] uppercase tracking-[0.22em] ${sectionStyles[section.heading] ?? 'text-lucky-text-muted'}`}
                                                        >
                                                            {section.heading}
                                                        </h3>
                                                        <ul className='space-y-1.5 text-sm leading-relaxed text-lucky-text-body'>
                                                            {section.items.map(
                                                                (item, i) => (
                                                                    <li
                                                                        key={i}
                                                                        className='flex gap-2'
                                                                    >
                                                                        <span className='mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-lucky-text-muted' />
                                                                        <span>
                                                                            {renderInlineMd(
                                                                                item,
                                                                            )}
                                                                        </span>
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </div>
                    </article>
                </main>

                <div className='hidden lg:block' />
            </div>
        </div>
    )
}
