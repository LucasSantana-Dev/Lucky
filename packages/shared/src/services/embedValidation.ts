export interface EmbedField {
    name: string
    value: string
    inline?: boolean
}

export interface EmbedData {
    title?: string
    description?: string
    color?: string
    footer?: string
    thumbnail?: string
    image?: string
    fields?: EmbedField[]
}

export function validateEmbedData(embedData: Partial<EmbedData>): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []
    const hasContent =
        embedData.title || embedData.description || embedData.fields?.length

    if (!hasContent) {
        errors.push('Embed must have at least a title, description, or fields')
    }
    if (embedData.title && embedData.title.length > 256) {
        errors.push('Title must be 256 characters or less')
    }
    if (embedData.description && embedData.description.length > 4096) {
        errors.push('Description must be 4096 characters or less')
    }
    if (embedData.color && !/^#[0-9A-Fa-f]{6}$/.test(embedData.color)) {
        errors.push('Color must be a valid hex code (e.g. #5865F2)')
    }

    return { valid: errors.length === 0, errors }
}

export function hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16)
}

export function decimalToHex(decimal: number): string {
    return '#' + decimal.toString(16).toUpperCase().padStart(6, '0')
}
