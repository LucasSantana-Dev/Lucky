export { TrackManagementService } from './service'
export type {
    TrackManagementOptions,
    TrackManagementResult,
    QueueState,
    TrackValidationResult,
    QueueOperationResult,
    TrackPriority,
    QueueManagementOptions
} from './types'

export {
    getQueueState,
    getQueueStats,
    isQueueEmpty,
    isQueueFull,
    getNextTrack,
    getTrackAtPosition,
    isTrackInQueue,
    getTrackPosition
} from './queueStateManager'

export {
    addTracksToQueue,
    addTrackToQueue,
    clearQueue,
    shuffleQueue,
    removeTrackFromQueue,
    moveTrackInQueue,
    replenishQueue
} from './queueOperations'

export {
    validateTrack,
    validateTracks
} from './trackValidator'

// Create default instance
import { TrackManagementService } from './service'
export const trackManagementService = new TrackManagementService()
