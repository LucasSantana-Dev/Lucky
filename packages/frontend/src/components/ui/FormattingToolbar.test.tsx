import { describe, it, expect, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import FormattingToolbar from './FormattingToolbar'

function Harness({ initial = 'hello' }: { initial?: string }) {
    const ref = useRef<HTMLTextAreaElement>(null)
    return (
        <div>
            <textarea ref={ref} aria-label='body' defaultValue={initial} />
            <FormattingToolbar textareaRef={ref} />
        </div>
    )
}

function setSelection(el: HTMLTextAreaElement, start: number, end: number) {
    el.focus()
    el.setSelectionRange(start, end)
}

describe('FormattingToolbar', () => {
    it('renders all five formatting buttons', () => {
        render(<Harness />)
        for (const label of [
            'Bold',
            'Italic',
            'Underline',
            'Strikethrough',
            'Spoiler',
        ]) {
            expect(screen.getByTitle(label)).toBeInTheDocument()
        }
    })

    it('wraps the selected text in bold markers', () => {
        render(<Harness initial='hello' />)
        const ta = screen.getByLabelText('body') as HTMLTextAreaElement
        setSelection(ta, 0, 5)
        fireEvent.click(screen.getByTitle('Bold'))
        expect(ta.value).toBe('**hello**')
    })

    it('wraps a sub-selection, leaving surrounding text intact', () => {
        render(<Harness initial='a brave world' />)
        const ta = screen.getByLabelText('body') as HTMLTextAreaElement
        setSelection(ta, 2, 7) // "brave"
        fireEvent.click(screen.getByTitle('Spoiler'))
        expect(ta.value).toBe('a ||brave|| world')
    })

    it('inserts markers at the cursor when nothing is selected', () => {
        render(<Harness initial='hi' />)
        const ta = screen.getByLabelText('body') as HTMLTextAreaElement
        setSelection(ta, 2, 2) // caret at end, no selection
        fireEvent.click(screen.getByTitle('Italic'))
        expect(ta.value).toBe('hi**') // '*' + '*' inserted at the caret
    })

    it('applies each mark type', () => {
        const cases: Array<[string, string]> = [
            ['Italic', '*hi*'],
            ['Underline', '__hi__'],
            ['Strikethrough', '~~hi~~'],
            ['Spoiler', '||hi||'],
        ]
        for (const [title, expected] of cases) {
            render(<Harness initial='hi' />)
            const ta = screen
                .getAllByLabelText('body')
                .pop() as HTMLTextAreaElement
            setSelection(ta, 0, 2)
            fireEvent.click(screen.getAllByTitle(title).pop()!)
            expect(ta.value).toBe(expected)
        }
    })

    it('is a no-op when the textarea ref is null', () => {
        const onChange = vi.fn()
        const ref = { current: null }
        render(<FormattingToolbar textareaRef={ref} />)
        // clicking must not throw even with no textarea attached
        expect(() => fireEvent.click(screen.getByTitle('Bold'))).not.toThrow()
        expect(onChange).not.toHaveBeenCalled()
    })
})
