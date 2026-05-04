import { Shield } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'
import FeatureCard from '@/components/Features/FeatureCard'
import FeatureErrorBanner from '@/components/Features/FeatureErrorBanner'
import { useFeaturesStore } from '@/stores/featuresStore'
import { useFeatures } from '@/hooks/useFeatures'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function FeaturesPage() {
    const features = useFeaturesStore((state) => state.features)
    const {
        globalToggles,
        isLoading,
        loadError,
        retryLoad,
    } = useFeatures()
    usePageMetadata({
        title: 'Features - Lucky',
        description: 'View available bot features and their current status',
    })

    if (isLoading) {
        return (
            <main className='p-6 space-y-6'>
                <Skeleton className='h-10 w-48' />
                <div className='space-y-4'>
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className='h-24 w-full' />
                    ))}
                </div>
            </main>
        )
    }

    return (
        <main className='p-4 md:p-6 space-y-8'>
            <header className='flex items-center gap-3'>
                <Shield className='w-7 h-7 text-lucky-red' aria-hidden='true' />
                <h1 className='type-h1 text-lucky-text-primary'>Features</h1>
            </header>

            {loadError && <FeatureErrorBanner loadError={loadError} retryLoad={retryLoad} />}

            <section>
                <h2 className='text-lg font-semibold text-white mb-2'>
                    Available Features
                </h2>
                <p className='text-sm text-lucky-text-secondary mb-6'>
                    Features currently available on this bot. Contact an admin if a
                    feature you need is disabled.
                </p>
                <div className='grid gap-4'>
                    {features.map((feature) => (
                        <FeatureCard
                            key={feature.name}
                            feature={feature}
                            enabled={globalToggles[feature.name] ?? true}
                            onToggle={() => {}}
                            isGlobal
                            readOnly
                        />
                    ))}
                </div>
            </section>
        </main>
    )
}
