import type { CommandCategory } from "src/config/constants"
import type { TCommandData, TCommandExecute } from "../types/CommandData"

interface ICommandOptions {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory
}

export default class Command {
    data: TCommandData
    execute: TCommandExecute
    category: CommandCategory

    constructor(options: ICommandOptions) {
        this.data = options.data
        this.execute = options.execute
        this.category = options.category
    }
}
