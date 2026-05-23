export function createAutoMessagesExecutor() {
    return {
        capture: jest.fn().mockResolvedValue({}),
        diff: jest.fn().mockReturnValue({ operations: [] }),
        apply: jest.fn().mockResolvedValue({ success: [] }),
    }
}
