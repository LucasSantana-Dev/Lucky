/**
 * Basic unit tests to verify Jest setup
 */

import { describe, it, expect } from '@jest/globals'

describe('Basic Tests', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true)
  })

  it('should handle simple math', () => {
    expect(2 + 2).toBe(4)
  })

  it('should handle string operations', () => {
    const str = 'Hello World'
    expect(str.toLowerCase()).toBe('hello world')
  })

  it('should handle array operations', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(arr.length).toBe(5)
    expect(arr.includes(3)).toBe(true)
  })

  it('should handle object operations', () => {
    const obj = { name: 'test', value: 42 }
    expect(obj.name).toBe('test')
    expect(obj.value).toBe(42)
  })

  it('should handle async operations', async () => {
    const promise = Promise.resolve('async result')
    const result = await promise
    expect(result).toBe('async result')
  })

  it('should handle error throwing', () => {
    expect(() => {
      throw new Error('Test error')
    }).toThrow('Test error')
  })
})
