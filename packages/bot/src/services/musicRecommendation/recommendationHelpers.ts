import type { Track } from 'discord-player'
import type { RecommendationResult, RecommendationConfig } from './types'
import { calculateDiversityScore } from './similarityCalculator'
import type { UserPreferenceSeed } from './types'

export function createUserPreferenceSeed(preferences: UserPreferenceSeed): Track {
	return {
		id: 'virtual-seed',
		title: 'User Preference Mix',
		author: preferences.artists[0] || 'Various Artists',
		duration: preferences.avgDuration * 1000,
		url: '',
		thumbnail: '',
		description: `Based on ${preferences.genres[0] || 'various'} music preferences`,
		views: 0,
		requestedBy: null,
		source: 'virtual' as 'youtube' | 'spotify' | 'soundcloud' | 'attachment',
		raw: {} as Record<string, unknown>,
		metadata: { source: 'virtual', engine: 'preferences' },
	} as unknown as Track
}

export function applyDiversityFilter(
	recommendations: RecommendationResult[],
	config: RecommendationConfig,
): RecommendationResult[] {
	if (recommendations.length <= 1 || config.diversityFactor <= 0) return recommendations

	const diverseRecommendations: RecommendationResult[] = []
	const usedTracks = new Set<string>()

	for (const rec of recommendations) {
		const trackKey = rec.track.id || rec.track.url
		if (usedTracks.has(trackKey)) continue
		const currentTracks = diverseRecommendations.map((r) => r.track)
		const diversityScore = calculateDiversityScore([...currentTracks, rec.track], config)
		if (diversityScore >= config.diversityFactor) {
			diverseRecommendations.push(rec)
			usedTracks.add(trackKey)
		}
	}

	return diverseRecommendations
}

export function generateRecommendationReasons(
	seedTrack: Track, recommendedTrack: Track, similarity: number, vectorSimilarity: number,
): string[] {
	const reasons: string[] = []
	if (similarity > 0.8) reasons.push('Very similar to your current track')
	else if (similarity > 0.6) reasons.push('Similar style to your current track')
	if (vectorSimilarity > 0.7) reasons.push('Matches your listening patterns')
	if (seedTrack.author === recommendedTrack.author) reasons.push('Same artist')

	const seedDuration = typeof seedTrack.duration === 'number' ? seedTrack.duration : parseInt(seedTrack.duration.toString(), 10)
	const recommendedDuration = typeof recommendedTrack.duration === 'number' ? recommendedTrack.duration : parseInt(recommendedTrack.duration.toString(), 10)
	if (Math.abs(seedDuration - recommendedDuration) < 30000) reasons.push('Similar duration')

	return reasons.length > 0 ? reasons : ['Recommended based on your preferences']
}
