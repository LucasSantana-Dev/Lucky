import type Command from "../../models/Command"
import path from "path"
import type { CommandCategory } from "../../config/constants"
import { COMMAND_CATEGORIES } from "../../config/constants"

/**
 * Determines the category of a command based on its name
 * This is a fallback method when folder structure information is not available
 */
export function getCategoryFromCommandName(
    commandName: string,
): CommandCategory {
    // Check each category's prefixes
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

    // Default category if no match is found
    return "general"
}

/**
 * Extracts the category from a command's file path
 * @param filePath The absolute path to the command file
 */
export function getCategoryFromFilePath(filePath: string): CommandCategory {
    const parts = filePath.split(path.sep)
    const functionsIndex = parts.findIndex((part) => part === "functions")

    if (functionsIndex >= 0 && functionsIndex + 1 < parts.length) {
        const category = parts[functionsIndex + 1]
        if (["music", "download", "general"].includes(category)) {
            return category as CommandCategory
        }
    }

    const fileName = path.basename(filePath)
    const commandName = fileName.split(".")[0].toLowerCase()
    return getCategoryFromCommandName(commandName)
}

/**
 * Gets the category of a command
 * @param command The command object
 */
export function getCommandCategory(command: Command): CommandCategory {
    if (!command?.data?.name) {
        return "general"
    }

    return getCategoryFromCommandName(command.data.name.toLowerCase())
}

/**
 * Gets the emoji for a category
 * @param category The category key
 * @returns The emoji for the category or a default emoji if not found
 */
export function getCategoryEmoji(category: CommandCategory): string {
    return COMMAND_CATEGORIES[category]?.emoji || "📋"
}

/**
 * Gets the label for a category
 * @param category The category key
 * @returns The label for the category or a default label if not found
 */
export function getCategoryLabel(category: CommandCategory): string {
    return COMMAND_CATEGORIES[category]?.label || "📋 Outros"
}

/**
 * Gets all available command categories
 * @returns An array of category objects with key, label, and emoji
 */
export function getAllCategories() {
    return Object.values(COMMAND_CATEGORIES).map(({ key, label, emoji }) => ({
        key,
        label,
        emoji,
    }))
}
