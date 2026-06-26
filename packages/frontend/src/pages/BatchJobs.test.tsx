import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from 'i18next'
import BatchJobsPage from './BatchJobs'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')

// Initialize i18n for testing
i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['batchJobs'],
    defaultNS: 'batchJobs',
    interpolation: {
        escapeValue: false,
    },
    resources: {
        en: {
            batchJobs: {
                noServerSelected: 'No Server Selected',
                selectServerToViewJobs: 'Select a server to view batch jobs',
                batchJobs: 'Batch Jobs',
                manageOperations: 'Manage bulk operations on your server',
                jobType: 'Job Type',
                status: 'Status',
                initiated: 'Initiated By',
                progress: 'Progress',
                date: 'Date',
                searchByTypeOrInitiator: 'Search by job type or initiator...',
                allStatuses: 'All statuses',
                pending: 'Pending',
                in_progress: 'In Progress',
                paused: 'Paused',
                completed: 'Completed',
                failed: 'Failed',
                cancelled: 'Cancelled',
                noBatchJobsFound: 'No batch jobs found',
                tryAdjustingFilters: 'Try adjusting your filters',
                batchJobsWillAppearHere: 'Batch jobs will appear here',
                showingToOf: 'Showing {{from}} to {{to}} of {{total}}',
                tableHeaderJob: 'Job',
                tableHeaderType: 'Type',
                tableHeaderStatus: 'Status',
                tableHeaderInitiator: 'Initiated By',
                tableHeaderProgress: 'Progress',
                tableHeaderDate: 'Date',
                jobDetails: 'Job Details',
                targetInfo: 'Target Info',
                items: 'Items',
                totalItems: 'Total Items',
                processedItems: 'Processed',
                failedItems: 'Failed',
                skippedItems: 'Skipped',
                successItems: 'Successful',
                createdAt: 'Created',
                startedAt: 'Started',
                completedAt: 'Completed',
                estimatedTime: 'Estimated Time',
                minutes: '{{count}} minutes',
                liveProgress: 'Live Progress',
                refresh: 'Refresh',
                cancel: 'Cancel',
                cancelJob: 'Cancel Job',
                cancelling: 'Cancelling...',
                jobCancelled: 'Job cancelled',
                failedToCancelJob: 'Failed to cancel job',
                failedToLoadJobs: 'Failed to load batch jobs',
                failedToLoadJobDetails: 'Failed to load job details',
                jobItemStatus: 'Item Status',
                noItemsFound: 'No items found',
                itemsWillAppearHere: 'Job items will appear here',
            },
        },
    },
})

const mockGuild = { id: '123', name: 'Test Server', botAdded: true }

const mockJobs = [
    {
        id: 'job1',
        guildId: '123',
        jobType: 'bulk_ban',
        status: 'in_progress' as const,
        initiatedBy: 'user1',
        sourceChannelId: undefined,
        targetChannelId: undefined,
        scope: {},
        options: {},
        totalItems: 100,
        processedItems: 45,
        failedItems: 2,
        skippedItems: 1,
        estimatedMinutes: 5,
        createdAt: new Date().toISOString(),
    },
    {
        id: 'job2',
        guildId: '123',
        jobType: 'channel_move',
        status: 'completed' as const,
        initiatedBy: 'user2',
        sourceChannelId: 'chan1',
        targetChannelId: 'chan2',
        scope: {},
        options: {},
        totalItems: 50,
        processedItems: 50,
        failedItems: 0,
        skippedItems: 0,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        id: 'job3',
        guildId: '123',
        jobType: 'bulk_warn',
        status: 'pending' as const,
        initiatedBy: 'user3',
        sourceChannelId: undefined,
        targetChannelId: undefined,
        scope: {},
        options: {},
        totalItems: 200,
        processedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
]

function mockGuildStore(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

function renderPage() {
    return render(
        <I18nextProvider i18n={i18n}>
            <MemoryRouter>
                <BatchJobsPage />
            </MemoryRouter>
        </I18nextProvider>,
    )
}

describe('BatchJobsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(
            globalThis.HTMLElement.prototype,
            'scrollIntoView',
            {
                configurable: true,
                value: vi.fn(),
            },
        )
    })

    test('shows no server selected message when no guild selected', () => {
        mockGuildStore(null)
        renderPage()

        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to view batch jobs'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders jobs list on success', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        expect(screen.getAllByText('channel_move').length).toBeGreaterThan(0)
        expect(screen.getAllByText('bulk_warn').length).toBeGreaterThan(0)
    })

    test('shows empty state when no jobs found', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No batch jobs found')).toBeInTheDocument()
        })

        expect(
            screen.getByText('Batch jobs will appear here'),
        ).toBeInTheDocument()
    })

    test('shows empty state on API error', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No batch jobs found')).toBeInTheDocument()
        })
    })

    test('status filter dropdown filters jobs', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        const filterTrigger = screen.getByRole('combobox')
        await user.click(filterTrigger)

        const completedOptions = await screen.findAllByText('Completed')
        const completedOption = completedOptions[completedOptions.length - 1]
        await user.click(completedOption)

        await waitFor(() => {
            expect(api.batchJobs.list).toHaveBeenCalledWith('123', {
                status: 'completed',
                limit: 15,
                offset: 0,
            })
        })
    })

    test('clicking job row opens detail modal', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)
        vi.mocked(api.batchJobs.getProgress).mockResolvedValue({
            data: { progress: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        const jobRows = screen.getAllByText('bulk_ban')
        const jobRow = jobRows[0].closest('[class*="grid"]')
        await user.click(jobRow!)

        expect(screen.getByText('Job Details')).toBeInTheDocument()
    })

    test('displays job status badges correctly', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('In Progress')).toBeInTheDocument()
        })

        expect(screen.getByText('Completed')).toBeInTheDocument()
        expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    test('modal displays progress correctly', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)
        vi.mocked(api.batchJobs.getProgress).mockResolvedValue({
            data: { progress: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        const jobRows = screen.getAllByText('bulk_ban')
        const jobRow = jobRows[0].closest('[class*="grid"]')
        await user.click(jobRow!)

        expect(screen.getByText('Total Items')).toBeInTheDocument()
        expect(screen.getByText('100')).toBeInTheDocument()
    })

    test('cancel job button calls cancel API', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)
        vi.mocked(api.batchJobs.getProgress).mockResolvedValue({
            data: { progress: null },
        } as any)
        vi.mocked(api.batchJobs.cancel).mockResolvedValue({
            data: { job: { ...mockJobs[0], status: 'cancelled' } },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        const jobRows = screen.getAllByText('bulk_ban')
        const jobRow = jobRows[0].closest('[class*="grid"]')
        await user.click(jobRow!)

        const cancelButton = await screen.findByText('Cancel Job')
        await user.click(cancelButton)

        await waitFor(() => {
            expect(api.batchJobs.cancel).toHaveBeenCalledWith('123', 'job1')
        })
    })

    test('filtering resets page to 1', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        const filterTrigger = screen.getByRole('combobox')
        await user.click(filterTrigger)

        const inProgressOptions = await screen.findAllByText('In Progress')
        const inProgressOption = inProgressOptions[inProgressOptions.length - 1]
        await user.click(inProgressOption)

        await waitFor(() => {
            expect(api.batchJobs.list).toHaveBeenCalledWith('123', {
                status: 'in_progress',
                limit: 15,
                offset: 0,
            })
        })
    })

    test('displays job initiator', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('user1')).toBeInTheDocument()
        })

        expect(screen.getByText('user2')).toBeInTheDocument()
        expect(screen.getByText('user3')).toBeInTheDocument()
    })

    test('displays job type and progress bar', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: mockJobs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('bulk_ban').length).toBeGreaterThan(0)
        })

        // Should display processed/total items
        expect(screen.getByText('45 / 100')).toBeInTheDocument()
    })

    test('displays empty state message when filters active', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: [] },
        } as any)

        renderPage()

        const user = userEvent.setup()
        const filterTrigger = screen.getByRole('combobox')
        await user.click(filterTrigger)

        const failedOption = await screen.findByText('Failed')
        await user.click(failedOption)

        await waitFor(() => {
            expect(
                screen.getByText('Try adjusting your filters'),
            ).toBeInTheDocument()
        })
    })

    test('EN strings are verbatim', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.batchJobs.list).mockResolvedValue({
            data: { jobs: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Batch Jobs')).toBeInTheDocument()
        })

        expect(
            screen.getByText('Manage bulk operations on your server'),
        ).toBeInTheDocument()
        expect(screen.getByText('No batch jobs found')).toBeInTheDocument()
    })
})
