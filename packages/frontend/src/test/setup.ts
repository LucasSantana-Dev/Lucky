import '@testing-library/jest-dom'
import '@/lib/i18n'

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
    class IntersectionObserverMock {
        readonly root = null
        readonly rootMargin = ''
        readonly thresholds: ReadonlyArray<number> = []
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return []
        }
    }
    ;(globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
        IntersectionObserverMock as unknown as typeof IntersectionObserver
}

if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function () {
        return false
    }
}

if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function () {}
}

if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function () {}
}
