import type { CommandCategory } from '../config/constants'
import type {
    TContextMenuData,
    TContextMenuExecute,
} from '../types/CommandData'

type ContextMenuCommandOptions = {
    data: TContextMenuData
    execute: TContextMenuExecute
    category: CommandCategory
    botPermissions?: bigint[]
}

export default class ContextMenuCommand {
    data: TContextMenuData
    execute: TContextMenuExecute
    category: CommandCategory
    botPermissions?: bigint[]

    constructor(options: ContextMenuCommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
        this.botPermissions = options.botPermissions
    }
}
