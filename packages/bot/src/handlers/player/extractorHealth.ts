import { musicExtractorDegradedGauge } from '../../utils/monitoring/prometheus'

const degradedExtractors = new Set<string>()

/**
 * Single source of truth for extractor health: updates both the in-process
 * readable state (checked at /play error time, #1929) and the Prometheus
 * gauge (scraped for alerting) together, so they can't drift apart.
 */
export function setExtractorDegraded(
    extractor: string,
    degraded: boolean,
): void {
    if (degraded) {
        degradedExtractors.add(extractor)
    } else {
        degradedExtractors.delete(extractor)
    }
    musicExtractorDegradedGauge.set({ extractor }, degraded ? 1 : 0)
}

export function isExtractorDegraded(extractor: string): boolean {
    return degradedExtractors.has(extractor)
}
