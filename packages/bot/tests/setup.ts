import { jest } from '@jest/globals'

// Neutralize the @snazzah/davey native addon (Discord DAVE E2E encryption).
// It is pulled in transitively (discord-player → discord-voip → @snazzah/davey)
// and registers a native `CustomGC` handle that keeps the jest worker alive.
// Under multi-worker runs jest force-exits the un-exitable worker, and whatever
// test is in-flight there times out — an intermittent, victim-varies failure
// that vanishes on rerun (the backend hit the same leak: #1322). discord-voip
// wraps the require in try/catch (DAVE is optional) and bot specs never exercise
// it, so an empty module is safe.
jest.mock('@snazzah/davey', () => ({}))
