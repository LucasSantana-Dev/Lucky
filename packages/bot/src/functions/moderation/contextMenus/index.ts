import type ContextMenuCommand from '../../../models/ContextMenuCommand'
import moveMessage from './moveMessage'

// Context menus are few, so they are listed explicitly rather than
// directory-scanned like slash commands. Add new ones to this array.
const moderationContextMenus = async (): Promise<ContextMenuCommand[]> => [
    moveMessage,
]

export default moderationContextMenus
