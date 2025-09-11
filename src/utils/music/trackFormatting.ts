import type { Track } from "discord-player"
import { errorLog } from "../general/log"

// Helper function to format duration
export const formatDuration = (duration: string): string => {
    try {
        const match = duration.match(/^(\d+):(\d+)$/)
        if (match) {
            const minutes = parseInt(match[1])
            const seconds = parseInt(match[2])
            return `${minutes}:${seconds.toString().padStart(2, "0")}`
        }
        return duration
    } catch (error) {
        errorLog({ message: "Error formatting duration:", error })
        return "Unknown"
    }
}

// Helper function to safely get track properties
export const getTrackInfo = (track: Track) => {
    try {
        return {
            title: track?.title ?? "Unknown song",
            duration: track?.duration
                ? formatDuration(track.duration)
                : "Unknown",
            requestedBy: track?.requestedBy?.username ?? "Unknown",
            url: track?.url ?? "",
        }
    } catch (error) {
        errorLog({ message: "Error getting track info:", error })
        return {
            title: "Unknown song",
            duration: "Unknown",
            requestedBy: "Unknown",
            url: "",
        }
    }
}
