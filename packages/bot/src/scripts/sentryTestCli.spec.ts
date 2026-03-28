const runSentryTestMock = jest.fn()
const handleSentryTestFailureMock = jest.fn()

jest.mock('./sentryTest', () => ({
    runSentryTest: (...args: unknown[]) => runSentryTestMock(...args),
    handleSentryTestFailure: (...args: unknown[]) =>
        handleSentryTestFailureMock(...args),
}))

describe('sentryTestCli', () => {
    beforeEach(() => {
        jest.resetModules()
        jest.clearAllMocks()
    })

    it('runs the sentry test script on import', async () => {
        runSentryTestMock.mockResolvedValue(undefined)

        await import('./sentryTestCli')
        await Promise.resolve()

        expect(runSentryTestMock).toHaveBeenCalledTimes(1)
        expect(handleSentryTestFailureMock).not.toHaveBeenCalled()
    })

    it('forwards failures to the shared CLI error handler', async () => {
        const error = new Error('boom')
        runSentryTestMock.mockRejectedValue(error)

        await import('./sentryTestCli')
        await Promise.resolve()
        await Promise.resolve()

        expect(handleSentryTestFailureMock).toHaveBeenCalledWith(error)
    })
})
