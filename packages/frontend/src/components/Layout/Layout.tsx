import { ReactNode } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'

interface LayoutProps {
    children: ReactNode
}

function Layout({ children }: LayoutProps) {
    return (
        <div className='flex flex-col h-screen bg-bg-primary'>
            <Navbar />
            <div className='flex flex-1 overflow-hidden'>
                <Sidebar />
                <main className='flex-1 overflow-y-auto p-4 md:p-6'>
                    {children}
                </main>
            </div>
        </div>
    )
}

export default Layout
