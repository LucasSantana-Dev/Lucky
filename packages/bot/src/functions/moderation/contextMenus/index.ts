import type ContextMenuCommand from '../../../models/ContextMenuCommand'
import moveMessage from './moveMessage'

const moderationContextMenus = async (): Promise<ContextMenuCommand[]> => [
    moveMessage,
]

export default moderationContextMenus
