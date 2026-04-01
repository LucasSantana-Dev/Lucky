// Make Jest globals available without explicit imports
import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals'

// Assign to global scope
Object.assign(global, {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  jest,
})
