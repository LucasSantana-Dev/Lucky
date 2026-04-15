---
status: proposed
created: 2026-04-15
owner: lucassantana
pr:
tags: autoplay,music,quality
---

# autoplay-diversity

## Goal
When Lucky auto-queues songs after the user's queue empties, results must feel curated — no repeated artists and no single-cluster collapse.

## Approach
Multi-objective ranking with diversity regularization: similarity to seed, penalty for artist within window, penalty for same album, boost on audio-feature match.

## Verification
- Golden dataset: 20 seed tracks.
- Offline eval harness.
- Soak in production for one week before default flip.
