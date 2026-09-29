import type Command from '../../models/Command'
import path from 'path'
import {
    COMMAND_CATEGORIES,
    type CommandCategory,
} from '../../config/constants'

export function getCategoryFromCommandName(
    commandName: string,
): CommandCategory {
    for (const [categoryKey, categoryConfig] of Object.entries(
        COMMAND_CATEGORIES,
    )) {
        if (
            categoryConfig.prefixes.some((prefix) =>
                commandName.startsWith(prefix),
            )
        ) {
            return categoryKey as CommandCategory
        }
    }

    return 'general'
}

export function getCategoryFromFilePath(filePath: string): CommandCategory {
    const parts = filePath.split(path.sep)
    const functionsIndex = parts.findIndex((part) => part === 'functions')

    if (functionsIndex >= 0 && functionsIndex + 1 < parts.length) {
        const category = parts[functionsIndex + 1]
        if (['music', 'general'].includes(category)) {
            return category as CommandCategory
        }
    }

    const fileName = path.basename(filePath)
    const commandName = fileName.split('.')[0].toLowerCase()
    return getCategoryFromCommandName(commandName)
}

export function getCommandCategory(command: Command): CommandCategory {
    if (!command?.data?.name) {
        return 'general'
    }

    // Trust the category the command declares on itself (`category: 'music'`
    // etc. in its `new Command({...})` definition) over prefix-guessing the
    // name: several real music commands (artist, album, seek, nowplaying,
    // spotify, voteskip, session, history, previous, replay, djrole, effects)
    // don't start with any prefix in COMMAND_CATEGORIES.music.prefixes and
    // were silently miscategorized as 'general' by name-based matching alone.
    return (
        command.category ??
        getCategoryFromCommandName(command.data.name.toLowerCase())
    )
}

export function getCategoryEmoji(category: CommandCategory): string {
    return COMMAND_CATEGORIES[category]?.emoji || '📋'
}

export function getCategoryLabel(category: CommandCategory): string {
    return COMMAND_CATEGORIES[category]?.label || '📋 General'
}

export function getAllCategories() {
    return Object.values(COMMAND_CATEGORIES).map(({ key, label, emoji }) => ({
        key,
        label,
        emoji,
    }))
}
