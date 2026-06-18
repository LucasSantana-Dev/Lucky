import type { CommandCategory } from '../config/constants'
import type { TCommandData, TCommandExecute } from '../types/CommandData'

type CommandOptions = {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
    botPermissions?: bigint[]
}

export default class Command {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
    botPermissions?: bigint[]

    constructor(options: CommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
        this.botPermissions = options.botPermissions
    }
}
