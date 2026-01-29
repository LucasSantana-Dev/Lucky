import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { Settings, LogOut } from 'lucide-react'

interface ProfileModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function ProfileModal({
    open,
    onOpenChange,
}: ProfileModalProps) {
    const user = useAuthStore((state) => state.user)
    const logout = useAuthStore((state) => state.logout)
    const navigate = useNavigate()

    const handleLogout = useCallback(async () => {
        await logout()
        onOpenChange(false)
    }, [logout, onOpenChange])

    const handleConfig = useCallback(() => {
        navigate('/config')
        onOpenChange(false)
    }, [navigate, onOpenChange])

    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='sm:max-w-md'>
                <DialogHeader>
                    <div className='flex items-center gap-4 mb-4'>
                        <Avatar className='w-16 h-16 border-2 border-lukbot-border'>
                            <AvatarImage
                                src={
                                    user.avatar
                                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                                        : undefined
                                }
                                alt={user.username || 'User avatar'}
                            />
                            <AvatarFallback className='bg-lukbot-red text-white text-xl'>
                                {user.username?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className='flex-1'>
                            <DialogTitle className='text-left'>
                                {user.username}
                            </DialogTitle>
                            <DialogDescription className='text-left'>
                                @{user.username}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className='space-y-2'>
                    <Button
                        onClick={handleConfig}
                        variant='ghost'
                        className='w-full justify-start'
                    >
                        <Settings className='w-4 h-4 mr-2' />
                        User Configuration
                    </Button>
                    <Button
                        onClick={handleLogout}
                        variant='ghost'
                        className='w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10'
                    >
                        <LogOut className='w-4 h-4 mr-2' />
                        Logout
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
