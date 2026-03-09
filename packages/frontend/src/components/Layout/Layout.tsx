import { ReactNode } from 'react'
import Sidebar from './Sidebar'

interface LayoutProps {
    children: ReactNode
}

function Layout({ children }: LayoutProps) {
    return (
        <div className='flex min-h-screen bg-lucky-bg-primary'>
            <Sidebar />
            <main className='flex-1 min-w-0 overflow-y-auto'>
                <div className='px-4 py-6 md:px-8 lg:px-10 max-w-[1400px] mx-auto'>
                    {children}
                </div>
            </main>
        </div>
    )
}

export default Layout
