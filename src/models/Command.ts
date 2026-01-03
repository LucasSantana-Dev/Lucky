import type { CommandCategory } from 'src/config/constants'
import type { TCommandData, TCommandExecute } from '../types/CommandData'

type CommandOptions = {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
}

export default class Command {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory

    constructor(options: CommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
    }
}
