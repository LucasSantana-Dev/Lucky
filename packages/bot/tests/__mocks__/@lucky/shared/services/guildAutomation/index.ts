export function createAutoMessagesExecutor() {
    return {
        capture: jest.fn().mockResolvedValue({}),
        diff: jest.fn().mockReturnValue({ operations: [] }),
        apply: jest.fn().mockResolvedValue({ success: [] }),
    }
}

export function createModerationExecutor() {
    return {
        capture: jest.fn().mockReturnValue({}),
        diff: jest.fn().mockReturnValue({ ops: [] }),
        apply: jest.fn().mockResolvedValue({ status: 'success', applied: [] }),
    }
}
