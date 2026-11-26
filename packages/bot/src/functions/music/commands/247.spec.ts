const requireGuildMock = jest.fn()
const interactionReplyMock = jest.fn()
const updateGuildSettingsMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const applyLeaveOptionsToQueueMock = jest.fn()
const clearIdleTimerMock = jest.fn()
const leaveIfIdleMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...a: unknown[]) => requireGuildMock(...a),
}))
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...a: unknown[]) => interactionReplyMock(...a),
}))
jest.mock('../../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))
jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        updateGuildSettings: (...a: unknown[]) => updateGuildSettingsMock(...a),
    },
}))
jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...a: unknown[]) => resolveGuildQueueMock(...a),
}))
jest.mock('../../../services/musicManagement/queueLeaveOptions', () => ({
    applyLeaveOptionsToQueue: (...a: unknown[]) =>
        applyLeaveOptionsToQueueMock(...a),
}))
jest.mock('../../../services/musicManagement/idleDisconnect', () => ({
    clearIdleTimer: (...a: unknown[]) => clearIdleTimerMock(...a),
    leaveIfIdle: (...a: unknown[]) => leaveIfIdleMock(...a),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

import stayConnectedCommand from './247'

function interaction(enabled: boolean, canManage = true) {
    return {
        guildId: 'g-1',
        guild: { id: 'g-1' },
        memberPermissions: { has: () => canManage },
        deferReply: jest.fn().mockResolvedValue(undefined),
        options: { getBoolean: () => enabled },
    } as any
}

const client = {} as any
const replied = () => interactionReplyMock.mock.calls[0][0].content.content

describe('/247 command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        updateGuildSettingsMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({ queue: null })
    })

    it('is a music command gated on Manage Server', () => {
        const json = stayConnectedCommand.data.toJSON() as any
        expect(json.name).toBe('247')
        expect(json.default_member_permissions).toBe('32')
        expect(json.options[0]).toMatchObject({
            name: 'enabled',
            required: true,
        })
        expect(stayConnectedCommand.category).toBe('music')
    })

    it('turns 24/7 mode on and saves it for the guild', async () => {
        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(updateGuildSettingsMock).toHaveBeenCalledWith('g-1', {
            stayConnected: true,
        })
        expect(clearIdleTimerMock).toHaveBeenCalledWith('g-1')
        expect(replied()).toBe('music.stayConnected.enabled')
    })

    it('turns 24/7 mode off', async () => {
        await stayConnectedCommand.execute({
            client,
            interaction: interaction(false),
        } as any)

        expect(updateGuildSettingsMock).toHaveBeenCalledWith('g-1', {
            stayConnected: false,
        })
        expect(clearIdleTimerMock).not.toHaveBeenCalled()
        expect(replied()).toBe('music.stayConnected.disabled')
    })

    it('applies the toggle to a queue that is already running', async () => {
        const queue = { deleted: false }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'g-1')
        expect(applyLeaveOptionsToQueueMock).toHaveBeenCalledWith(queue, true)
    })

    it('applies the off toggle to a running queue and leaves it if idle', async () => {
        const queue = { deleted: false }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(false),
        } as any)

        expect(applyLeaveOptionsToQueueMock).toHaveBeenCalledWith(queue, false)
        expect(leaveIfIdleMock).toHaveBeenCalledWith(queue)
    })

    it('does not check idleness when turning 24/7 on', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: { deleted: false } })

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(leaveIfIdleMock).not.toHaveBeenCalled()
    })

    it('falls back to the raw member permissions bitfield', async () => {
        const raw = {
            ...interaction(true),
            memberPermissions: null,
            member: { permissions: '32' },
        }
        await stayConnectedCommand.execute({ client, interaction: raw } as any)
        expect(updateGuildSettingsMock).toHaveBeenCalled()

        jest.clearAllMocks()
        const denied = {
            ...interaction(true),
            memberPermissions: null,
            member: { permissions: '0' },
        }
        await stayConnectedCommand.execute({
            client,
            interaction: denied,
        } as any)
        expect(updateGuildSettingsMock).not.toHaveBeenCalled()
        expect(replied()).toBe('music.stayConnected.needManageGuild')
    })

    it('leaves a deleted queue alone', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: { deleted: true } })

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(applyLeaveOptionsToQueueMock).not.toHaveBeenCalled()
    })

    it('refuses members without Manage Server', async () => {
        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true, false),
        } as any)

        expect(updateGuildSettingsMock).not.toHaveBeenCalled()
        expect(replied()).toBe('music.stayConnected.needManageGuild')
    })

    it('reports a failed save without touching the queue', async () => {
        updateGuildSettingsMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: { deleted: false } })

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(applyLeaveOptionsToQueueMock).not.toHaveBeenCalled()
        expect(clearIdleTimerMock).not.toHaveBeenCalled()
        expect(replied()).toBe('music.stayConnected.failed')
    })

    it('reports an error thrown while saving', async () => {
        updateGuildSettingsMock.mockRejectedValue(new Error('db down'))

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(replied()).toBe('music.stayConnected.failed')
    })

    it('does nothing outside a guild', async () => {
        requireGuildMock.mockResolvedValue(false)

        await stayConnectedCommand.execute({
            client,
            interaction: interaction(true),
        } as any)

        expect(updateGuildSettingsMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})
