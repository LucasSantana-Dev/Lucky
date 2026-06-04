/**
 * Result of image validation.
 */
export interface ImageValidationResult {
    valid: boolean
    error?: string
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Validates an uploaded support image against size and type constraints.
 *
 * Acceptance criteria:
 * - Size <= 5 MB
 * - MIME type in {image/png, image/jpeg, image/webp}
 *
 * Rejection criteria:
 * - Size > 5 MB → "Image exceeds 5 MB limit"
 * - MIME type not in allowlist → "Unsupported image type"
 * - Missing size or type → "Missing image size or type"
 *
 * @param input Object with size (bytes) and mimetype
 * @returns Validation result with valid flag and optional error message
 */
export function validateSupportImage(input: {
    size?: number
    mimetype?: string
}): ImageValidationResult {
    if (input.size === undefined || input.mimetype === undefined) {
        return {
            valid: false,
            error: 'Missing image size or type',
        }
    }

    if (input.size > MAX_IMAGE_SIZE_BYTES) {
        return {
            valid: false,
            error: `Image exceeds 5 MB limit (received ${(input.size / (1024 * 1024)).toFixed(2)} MB)`,
        }
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimetype)) {
        return {
            valid: false,
            error: `Unsupported image type: ${input.mimetype}. Supported: PNG, JPEG, WebP`,
        }
    }

    return { valid: true }
}
