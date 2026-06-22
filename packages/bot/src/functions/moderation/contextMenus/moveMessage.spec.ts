import moveMessage, { MOVE_MESSAGE_SELECT_PREFIX } from './moveMessage'

describe('moveMessage context menu', () => {
    const makeInteraction = (over: Record<string, unknown> = {}) => ({
        memberPermissions: { has: () => true },
        channelId: 'chan',
        targetMessage: { id: 'msg' },
        reply: jest.fn().mockResolvedValue(undefined),
        ...over,
    })

    it('exposes message-type command metadata gated on Manage Messages', () => {
        const json = moveMessage.data.toJSON()
        expect(json.name).toBe('Move message')
        expect(json.type).toBe(3)
        expect(json.default_member_permissions).toBe('8192')
    })

    it('opens an ephemeral channel picker for a moderator', async () => {
        const interaction = makeInteraction()
        await moveMessage.execute({ interaction } as never)

        expect(interaction.reply).toHaveBeenCalledTimes(1)
        const arg = (interaction.reply as jest.Mock).mock.calls[0][0]
        expect(arg.components).toHaveLength(1)
        expect(JSON.stringify(arg.components[0].toJSON())).toContain(
            `${MOVE_MESSAGE_SELECT_PREFIX}chan:msg`,
        )
    })

    it('refuses a member without Manage Messages', async () => {
        const interaction = makeInteraction({
            memberPermissions: { has: () => false },
        })
        await moveMessage.execute({ interaction } as never)

        const arg = (interaction.reply as jest.Mock).mock.calls[0][0]
        expect(arg.content).toContain('Manage Messages')
        expect(arg.components).toBeUndefined()
    })
})
