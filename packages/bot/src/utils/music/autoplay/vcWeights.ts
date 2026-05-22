export function buildVcContributionWeights(
	historyTracks: { requestedBy?: { id?: string } | null }[],
	vcMemberIds: string[],
): Map<string, number> {
	const contributions = new Map<string, number>()

	for (const memberId of vcMemberIds) {
		const count = historyTracks.filter(
			(t) => t.requestedBy?.id === memberId,
		).length
		contributions.set(memberId, count > 0 ? count : 1)
	}

	const totalWeight = Array.from(contributions.values()).reduce(
		(sum, w) => sum + w,
		0,
	)
	const scaleFactor = vcMemberIds.length / totalWeight

	const weights = new Map<string, number>()
	for (const [memberId, count] of contributions) {
		weights.set(memberId, count * scaleFactor)
	}

	return weights
}
