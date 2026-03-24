import '@testing-library/jest-dom/vitest'

globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
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
