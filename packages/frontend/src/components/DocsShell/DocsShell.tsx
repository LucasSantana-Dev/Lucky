import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'

export type DocsNavItem = {
    label: string
    href: string
    external?: boolean
}

export type DocsNavGroup = {
    heading: string
    items: DocsNavItem[]
}

export type DocsTocItem = {
    id: string
    label: string
    depth?: 2 | 3
}

type Props = {
    nav: DocsNavGroup[]
    toc?: DocsTocItem[]
    breadcrumb: string
    title: string
    lastUpdated?: string
    children: ReactNode
}

export default function DocsShell({ nav, toc, breadcrumb, title, lastUpdated, children }: Props) {
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [activeId, setActiveId] = useState<string | null>(null)

    useEffect(() => {
        setSidebarOpen(false)
    }, [location.pathname])

    useEffect(() => {
        if (!toc?.length) return
        const headings = toc
            .map((t) => document.getElementById(t.id))
            .filter((el): el is HTMLElement => Boolean(el))

        if (!headings.length) return

        const obs = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]) setActiveId(visible[0].target.id)
            },
            { rootMargin: '-80px 0px -65% 0px', threshold: 0.1 },
        )
        headings.forEach((h) => obs.observe(h))
        return () => obs.disconnect()
    }, [toc])

    return (
        <div className='min-h-screen bg-lucky-surface-canvas text-white'>
            <header className='sticky top-0 z-30 border-b border-lucky-border-soft bg-lucky-surface-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-lucky-surface-canvas/65'>
                <div className='mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:px-6'>
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={() => setSidebarOpen((v) => !v)}
                            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
                            className='lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-lucky-text-muted hover:bg-lucky-surface-panel hover:text-lucky-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand'
                        >
                            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
                        </button>
                        <Link
                            to='/'
                            className='inline-flex items-center gap-2 text-lucky-text-strong hover:text-lucky-brand transition-colors'
                        >
                            <img src='/lucky-logo.png' alt='Lucky' width='24' height='24' className='h-6 w-6 rounded-full' loading='eager' />
                            <span className='font-mono text-sm font-semibold tracking-tight'>
                                lucky<span className='text-lucky-brand'>.</span>
                            </span>
                        </Link>
                        <span className='ml-1 hidden text-lucky-border-strong md:inline'>/</span>
                        <span className='hidden font-mono text-xs uppercase tracking-[0.2em] text-lucky-text-muted md:inline'>
                            {breadcrumb}
                        </span>
                    </div>
                    <nav className='flex items-center gap-1 font-mono text-xs text-lucky-text-muted'>
                        <Link to='/docs' className='hidden sm:inline-flex items-center rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors'>
                            docs
                        </Link>
                        <Link to='/changelog' className='hidden sm:inline-flex items-center rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors'>
                            changelog
                        </Link>
                        <a
                            href='https://github.com/LucasSantana-Dev/Lucky'
                            target='_blank'
                            rel='noreferrer'
                            className='inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 hover:bg-lucky-surface-panel hover:text-lucky-text-strong transition-colors'
                        >
                            github <ArrowUpRight size={11} aria-hidden />
                        </a>
                    </nav>
                </div>
            </header>

            <div className='mx-auto grid max-w-7xl gap-0 px-0 md:px-6 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]'>
                <DocsSidebar nav={nav} open={sidebarOpen} />

                <main className='min-w-0 px-4 py-10 md:px-8 md:py-14 lg:px-10'>
                    <article className='mx-auto max-w-2xl'>
                        <header className='mb-10 border-b border-lucky-border-soft pb-6'>
                            <p className='mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                                {breadcrumb}
                            </p>
                            <h1 className='text-3xl font-bold tracking-tight text-lucky-text-strong md:text-4xl'>{title}</h1>
                            {lastUpdated ? (
                                <p className='mt-3 font-mono text-xs text-lucky-text-muted'>
                                    last updated: {lastUpdated}
                                </p>
                            ) : null}
                        </header>
                        <div className='docs-prose'>{children}</div>
                    </article>
                </main>

                {toc?.length ? <DocsToc toc={toc} activeId={activeId} /> : <div className='hidden lg:block' />}
            </div>
        </div>
    )
}

function DocsSidebar({ nav, open }: { nav: DocsNavGroup[]; open: boolean }) {
    const { pathname } = useLocation()

    return (
        <aside
            className={`${open ? 'block' : 'hidden'} lg:block border-r border-lucky-border-soft bg-lucky-surface-canvas`}
            aria-label='Documentation navigation'
        >
            <div className='sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-8 md:px-6'>
                <nav className='space-y-7'>
                    {nav.map((group) => (
                        <div key={group.heading}>
                            <h4 className='mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                                {group.heading}
                            </h4>
                            <ul className='space-y-0.5'>
                                {group.items.map((item) => {
                                    const isActive = !item.external && pathname === item.href
                                    const base =
                                        'group inline-flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors'
                                    const inactiveCls = `${base} text-lucky-text-body hover:bg-lucky-surface-panel hover:text-lucky-text-strong`
                                    const activeCls = `${base} bg-lucky-surface-panel text-lucky-text-strong shadow-[inset_2px_0_0_var(--color-lucky-brand)]`
                                    if (item.external) {
                                        return (
                                            <li key={item.href}>
                                                <a
                                                    href={item.href}
                                                    target='_blank'
                                                    rel='noreferrer'
                                                    className={inactiveCls}
                                                >
                                                    <span>{item.label}</span>
                                                    <ArrowUpRight size={11} aria-hidden className='text-lucky-text-muted' />
                                                </a>
                                            </li>
                                        )
                                    }
                                    return (
                                        <li key={item.href}>
                                            <Link to={item.href} className={isActive ? activeCls : inactiveCls}>
                                                <span>{item.label}</span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </div>
        </aside>
    )
}

function DocsToc({ toc, activeId }: { toc: DocsTocItem[]; activeId: string | null }) {
    return (
        <aside className='hidden lg:block' aria-label='On this page'>
            <div className='sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-6 py-10'>
                <h4 className='mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                    On this page
                </h4>
                <ul className='space-y-1.5 border-l border-lucky-border-soft pl-3'>
                    {toc.map((item) => {
                        const isActive = activeId === item.id
                        return (
                            <li key={item.id} className={item.depth === 3 ? 'pl-3' : ''}>
                                <a
                                    href={`#${item.id}`}
                                    className={`inline-block text-xs leading-snug transition-colors ${
                                        isActive
                                            ? 'text-lucky-brand font-medium'
                                            : 'text-lucky-text-muted hover:text-lucky-text-strong'
                                    }`}
                                >
                                    {item.label}
                                </a>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </aside>
    )
}
