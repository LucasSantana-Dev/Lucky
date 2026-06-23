import { useNavigate } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function DashboardPage() {
    const navigate = useNavigate()
    const { t } = useTranslation()
    const { selectedGuild } = useGuildSelection()
    usePageMetadata({
        title: 'Dashboard - Lucky',
        description: 'Manage your Discord bot servers and settings',
    })

    if (!selectedGuild) {
        return (
            <main className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <div className='w-24 h-24 bg-lucky-bg-tertiary rounded-2xl flex items-center justify-center mb-4'>
                    <FolderKanban
                        className='w-12 h-12 text-lucky-text-tertiary'
                        aria-hidden='true'
                    />
                </div>
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('dashboard.noServerSelected')}
                </h2>
                <p className='type-body text-lucky-text-secondary mb-4'>
                    {t('dashboard.selectServerFromSidebar')}
                </p>
                <Button onClick={() => navigate('/servers')}>
                    {t('dashboard.viewYourServers')}
                </Button>
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <header>
                <h1 className='type-h1 text-lucky-text-primary mb-4'>
                    {t('dashboard.pageTitle')}
                </h1>
            </header>
            <section aria-labelledby='server-grid-heading'>
                <h2 id='server-grid-heading' className='sr-only'>
                    Server Grid
                </h2>
                <ServerGrid />
            </section>
        </main>
    )
}
