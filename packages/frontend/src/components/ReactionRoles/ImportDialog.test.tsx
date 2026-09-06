import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportDialog } from './ImportDialog'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: { reactionRoles: { create: vi.fn() } },
}))

const createMock = vi.mocked(api.reactionRoles.create)

const validItem = {
    channelId: '11111111111111111',
    title: 'Pick roles',
    description: 'Choose below',
    roles: [{ roleId: '22222222222222222', label: 'Gamer', style: 'Primary' }],
}
const validJson = JSON.stringify([validItem, { ...validItem, title: 'Two' }])

function renderDialog(props: Partial<Parameters<typeof ImportDialog>[0]> = {}) {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    render(
        <ImportDialog
            isOpen
            onClose={onClose}
            onSuccess={onSuccess}
            guildId='g1'
            {...props}
        />,
    )
    return { onClose, onSuccess }
}

describe('ImportDialog', () => {
    beforeEach(() => {
        createMock.mockReset()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders the dialog with paste + file inputs', () => {
        renderDialog()
        expect(screen.getByText('Import Reaction Roles')).toBeInTheDocument()
        expect(screen.getByLabelText('Paste JSON')).toBeInTheDocument()
        expect(screen.getByLabelText('Or upload a file')).toBeInTheDocument()
    })

    it('disables Import until JSON is entered', () => {
        renderDialog()
        const importBtn = screen.getByRole('button', { name: 'Import' })
        expect(importBtn).toBeDisabled()
        fireEvent.change(screen.getByLabelText('Paste JSON'), {
            target: { value: validJson },
        })
        expect(importBtn).toBeEnabled()
    })

    it('shows validation errors and does not call the API for invalid JSON', () => {
        renderDialog()
        fireEvent.change(screen.getByLabelText('Paste JSON'), {
            target: { value: '{not valid json' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))
        expect(screen.getByText('Validation errors')).toBeInTheDocument()
        expect(createMock).not.toHaveBeenCalled()
    })

    it('reads an uploaded .json file into the paste field', async () => {
        renderDialog()
        const file = new File([validJson], 'roles.json', {
            type: 'application/json',
        })
        fireEvent.change(screen.getByLabelText('Or upload a file'), {
            target: { files: [file] },
        })
        await waitFor(() =>
            expect(
                (screen.getByLabelText('Paste JSON') as HTMLTextAreaElement)
                    .value,
            ).toContain('Pick roles'),
        )
    })

    it('ignores a file-select with no file', () => {
        renderDialog()
        fireEvent.change(screen.getByLabelText('Or upload a file'), {
            target: { files: [] },
        })
        expect(
            (screen.getByLabelText('Paste JSON') as HTMLTextAreaElement).value,
        ).toBe('')
    })

    it('creates each message and resets + closes on full success', async () => {
        vi.useFakeTimers()
        createMock.mockResolvedValue({ messageId: 'm' })
        const { onClose, onSuccess } = renderDialog()
        fireEvent.change(screen.getByLabelText('Paste JSON'), {
            target: { value: validJson },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))

        await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(2))
        await vi.waitFor(() =>
            expect(
                screen.getByText(/Successfully created 2 message/),
            ).toBeInTheDocument(),
        )
        vi.advanceTimersByTime(1500)
        expect(onSuccess).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('reports per-item errors without aborting the batch', async () => {
        createMock
            .mockResolvedValueOnce({ messageId: 'm1' })
            .mockRejectedValueOnce(new Error('boom'))
        renderDialog()
        fireEvent.change(screen.getByLabelText('Paste JSON'), {
            target: { value: validJson },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Import' }))

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2))
        expect(
            await screen.findByText(/Completed with 1 error/),
        ).toBeInTheDocument()
        expect(screen.getByText(/boom/)).toBeInTheDocument()
    })
})
