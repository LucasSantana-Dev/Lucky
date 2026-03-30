import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GuildAutomation from './GuildAutomation'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type {
    AutomationRun,
    GuildAutomationManifest,
    PlanResult,
    ApplyResult,
} from '@/services/automationApi'
import { toast } from 'sonner'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api', () => ({
    api: {
        automation: {
            getStatus: vi.fn(),
            getManifest: vi.fn(),
            updateManifest: vi.fn(),
            plan: vi.fn(),
            apply: vi.fn(),
            reconcile: vi.fn(),
        },
    },
}))
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

function mockGuildStore(overrides: any = {}) {
    vi.mocked(useGuildStore).mockImplementation((selector?: any) => {
        const state = {
            selectedGuild: { id: '456', name: 'Test Automation Guild' },
            ...overrides,
        }
        return typeof selector === 'function' ? selector(state) : state
    })
}

const mockRun: AutomationRun = {
    id: 'run-1',
    guildId: '456',
    type: 'plan',
    status: 'success',
    summary: 'Plan executed successfully',
    createdAt: '2026-03-30T10:00:00Z',
    completedAt: '2026-03-30T10:01:00Z',
}

const mockManifest: GuildAutomationManifest = {
    guildId: '456',
    version: '1',
    roles: { admin: { name: 'Admin', permissions: [] } },
    channels: { general: { name: 'general', type: 'text' } },
}

const mockPlanResult: PlanResult = {
    summary: 'Found 2 changes to apply',
    changes: [
        {
            type: 'role',
            resource: 'moderator',
            action: 'create',
            details: {},
        },
        {
            type: 'channel',
            resource: 'announcements',
            action: 'update',
            details: {},
        },
    ],
}

const mockApplyResult: ApplyResult = {
    applied: 2,
    failed: 0,
    summary: 'Applied 2 changes successfully',
    changes: [
        {
            type: 'role',
            resource: 'moderator',
            action: 'create',
            status: 'success',
        },
        {
            type: 'channel',
            resource: 'announcements',
            action: 'update',
            status: 'success',
        },
    ],
}

describe('GuildAutomation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows empty state when no guild selected', () => {
        mockGuildStore({ selectedGuild: null })

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        expect(screen.getByText('No server selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to manage Guild Automation.'),
        ).toBeInTheDocument()
    })

    test('renders automation status card when guild selected', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Guild Automation')).toBeInTheDocument()
            expect(screen.getByText('Automation Status')).toBeInTheDocument()
        })
    })

    test('displays status badge correctly', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('applied')).toBeInTheDocument()
        })
    })

    test('renders action buttons', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Plan')).toBeInTheDocument()
            expect(screen.getByText('Apply')).toBeInTheDocument()
            expect(screen.getByText('Reconcile')).toBeInTheDocument()
        })
    })

    test('executes plan action successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.plan).mockResolvedValue(mockPlanResult)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Plan'))

        const planButton = screen.getByText('Plan')
        await user.click(planButton)

        await waitFor(() => {
            expect(api.automation.plan).toHaveBeenCalledWith('456')
            expect(toast.success).toHaveBeenCalledWith('Plan generated.')
        })
    })

    test('displays plan result with changes', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.plan).mockResolvedValue(mockPlanResult)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Plan'))

        const planButton = screen.getByText('Plan')
        await user.click(planButton)

        await waitFor(() => {
            expect(screen.getByText('Plan Result')).toBeInTheDocument()
            expect(
                screen.getByText('Found 2 changes to apply'),
            ).toBeInTheDocument()
            expect(screen.getByText('moderator')).toBeInTheDocument()
            expect(screen.getByText('announcements')).toBeInTheDocument()
        })
    })

    test('executes apply action successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.apply).mockResolvedValue(mockApplyResult)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Apply'))

        const applyButton = screen.getByText('Apply')
        await user.click(applyButton)

        await waitFor(() => {
            expect(api.automation.apply).toHaveBeenCalledWith('456')
            expect(toast.success).toHaveBeenCalledWith('Changes applied.')
        })
    })

    test('displays apply result with statistics', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.apply).mockResolvedValue(mockApplyResult)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Apply'))

        const applyButton = screen.getByText('Apply')
        await user.click(applyButton)

        await waitFor(() => {
            expect(screen.getByText('Apply Result')).toBeInTheDocument()
            expect(screen.getByText('2 applied')).toBeInTheDocument()
            expect(
                screen.getByText('Applied 2 changes successfully'),
            ).toBeInTheDocument()
        })
    })

    test('executes reconcile action successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.reconcile).mockResolvedValue(mockApplyResult)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Reconcile'))

        const reconcileButton = screen.getByText('Reconcile')
        await user.click(reconcileButton)

        await waitFor(() => {
            expect(api.automation.reconcile).toHaveBeenCalledWith('456')
            expect(toast.success).toHaveBeenCalledWith(
                'Reconciliation complete.',
            )
        })
    })

    test('displays manifest editor collapsed by default', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Manifest')).toBeInTheDocument()
            expect(screen.getByText('v1')).toBeInTheDocument()
        })

        expect(screen.queryByText('Save Manifest')).not.toBeInTheDocument()
    })

    test('expands and shows manifest editor', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Manifest'))

        const expandButton = screen.getByText('Expand')
        await user.click(expandButton)

        await waitFor(() => {
            expect(screen.getByText('Save Manifest')).toBeInTheDocument()
        })
    })

    test('saves manifest successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.updateManifest).mockResolvedValue({
            guildId: '456',
            version: '2',
            updatedAt: '2026-03-30T12:00:00Z',
        })

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Manifest'))

        const expandButton = screen.getByText('Expand')
        await user.click(expandButton)

        await waitFor(() => screen.getByText('Save Manifest'))

        const saveButton = screen.getByText('Save Manifest')
        await user.click(saveButton)

        await waitFor(() => {
            expect(api.automation.updateManifest).toHaveBeenCalled()
            expect(toast.success).toHaveBeenCalledWith(
                'Manifest saved successfully.',
            )
        })
    })

    test('shows error when manifest JSON is invalid', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(null)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Manifest'))

        const expandButton = screen.getByText('Expand')
        await user.click(expandButton)

        await waitFor(() => screen.getByText('Save Manifest'))

        const textarea = screen.getByPlaceholderText(/guildId/)
        await user.clear(textarea)
        await user.type(textarea, 'invalid json')

        const saveButton = screen.getByText('Save Manifest')
        await user.click(saveButton)

        await waitFor(() => {
            expect(
                screen.getByText(
                    'Invalid JSON — please fix syntax errors before saving.',
                ),
            ).toBeInTheDocument()
        })
    })

    test('displays run history when runs exist', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [mockRun],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Run History')).toBeInTheDocument()
            expect(screen.getByText('plan')).toBeInTheDocument()
            expect(screen.getByText('success')).toBeInTheDocument()
        })
    })

    test('shows empty state when no runs exist', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No runs yet')).toBeInTheDocument()
            expect(
                screen.getByText('Run a plan or apply to see results here.'),
            ).toBeInTheDocument()
        })
    })

    test('displays run with summary text', async () => {
        const runWithSummary: AutomationRun = {
            ...mockRun,
            summary: 'Plan executed successfully',
        }

        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [runWithSummary],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('plan')).toBeInTheDocument()
            expect(screen.getByText('success')).toBeInTheDocument()
        })
    })

    test('displays error message in run card when error exists', async () => {
        const runWithError: AutomationRun = {
            ...mockRun,
            status: 'failed',
            error: 'Failed to create role: permission denied',
        }

        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'failed',
            runs: [runWithError],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(
                screen.getByText('Failed to create role: permission denied'),
            ).toBeInTheDocument()
        })
    })

    test('refreshes data when refresh button clicked', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Automation Status'))

        vi.clearAllMocks()

        const refreshButtons = document.querySelectorAll('button')
        const refreshButton = Array.from(refreshButtons).find((btn) =>
            btn.querySelector('svg'),
        )

        if (refreshButton) {
            await user.click(refreshButton)

            await waitFor(() => {
                expect(api.automation.getStatus).toHaveBeenCalled()
                expect(api.automation.getManifest).toHaveBeenCalled()
            })
        }
    })

    test('handles API errors gracefully', async () => {
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockRejectedValue(
            new Error('Network error'),
        )
        vi.mocked(api.automation.getManifest).mockRejectedValue(
            new Error('Network error'),
        )

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Guild Automation')).toBeInTheDocument()
        })
    })

    test('shows no manifest warning when manifest is null', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'unknown',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(null)

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Manifest'))

        const expandButton = screen.getByText('Expand')
        await user.click(expandButton)

        await waitFor(() => {
            expect(
                screen.getByText(
                    /No manifest found. Paste or write a manifest below to get started/,
                ),
            ).toBeInTheDocument()
        })
    })

    test('disables action buttons when action is in progress', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.automation.getStatus).mockResolvedValue({
            status: 'applied',
            runs: [],
        })
        vi.mocked(api.automation.getManifest).mockResolvedValue(mockManifest)
        vi.mocked(api.automation.plan).mockImplementation(
            () => new Promise(() => {}),
        )

        render(
            <MemoryRouter>
                <GuildAutomation />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('Plan'))

        const planButton = screen.getByText('Plan')
        await user.click(planButton)

        const applyButton = screen.getByText('Apply')
        const reconcileButton = screen.getByText('Reconcile')

        expect(planButton).toBeDisabled()
        expect(applyButton).toBeDisabled()
        expect(reconcileButton).toBeDisabled()
    })
})
