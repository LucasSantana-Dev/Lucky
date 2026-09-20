import { Bold, Italic, Underline, Trash2, Eye } from 'lucide-react'
import Button from './Button'

interface FormattingToolbarProps {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

const FORMATTING_MARKS = {
    bold: { start: '**', end: '**', label: 'Bold', icon: Bold },
    italic: { start: '*', end: '*', label: 'Italic', icon: Italic },
    underline: {
        start: '__',
        end: '__',
        label: 'Underline',
        icon: Underline,
    },
    strikethrough: {
        start: '~~',
        end: '~~',
        label: 'Strikethrough',
        icon: Trash2,
    },
    spoiler: { start: '||', end: '||', label: 'Spoiler', icon: Eye },
} as const

function FormattingToolbar({ textareaRef }: FormattingToolbarProps) {
    function applyFormatting(key: keyof typeof FORMATTING_MARKS) {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = textarea.value
        const selectedText = text.substring(start, end)
        const { start: startMark, end: endMark } = FORMATTING_MARKS[key]

        let newText: string
        let cursorPos: number

        if (selectedText) {
            // Wrap selection
            newText =
                text.substring(0, start) +
                startMark +
                selectedText +
                endMark +
                text.substring(end)
            cursorPos = end + startMark.length + endMark.length
        } else {
            // Insert at cursor
            newText =
                text.substring(0, start) +
                startMark +
                endMark +
                text.substring(start)
            cursorPos = start + startMark.length
        }

        // Update textarea value and cursor position
        textarea.value = newText
        textarea.focus()
        textarea.setSelectionRange(cursorPos, cursorPos)

        // Dispatch input event to trigger onChange
        const event = new Event('input', { bubbles: true })
        textarea.dispatchEvent(event)
    }

    return (
        <div className='flex gap-1 rounded-md border border-lucky-border bg-lucky-bg-tertiary/50 p-1.5'>
            {Object.entries(FORMATTING_MARKS).map(
                ([key, { label, icon: Icon }]) => (
                    <Button
                        key={key}
                        type='button'
                        variant='secondary'
                        size='sm'
                        title={label}
                        onClick={() =>
                            applyFormatting(
                                key as keyof typeof FORMATTING_MARKS,
                            )
                        }
                        className='h-7 w-7 p-0'
                    >
                        <Icon className='h-3.5 w-3.5' />
                    </Button>
                ),
            )}
        </div>
    )
}

export default FormattingToolbar
