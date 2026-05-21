/**
 * Re-export barrel for lastFm functions consumed by the autoplay pipeline.
 * Reduces coupling between lastfm/index.ts and autoplay modules.
 */

export { consumeLastFmSeedSlice, consumeBlendedSeedSlice } from './lastFmSeeds'
