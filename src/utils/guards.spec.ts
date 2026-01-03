import { describe, it, expect } from '@jest/globals'
import {
    isString,
    isNumber,
    isBoolean,
    isObject,
    isArray,
    isNonEmptyString,
    isNonEmptyArray,
    isGuildId,
    isUserId,
    isChannelId,
    isYouTubeUrl,
    isSpotifyUrl,
    isDiscordInvite,
    hasProperty,
    isFunction,
    isPromise,
    isError,
} from './guards'

describe('Type Guards', () => {
    describe('isString', () => {
        it('should return true for strings', () => {
            expect(isString('hello')).toBe(true)
            expect(isString('')).toBe(true)
            expect(isString('123')).toBe(true)
        })

        it('should return false for non-strings', () => {
            expect(isString(123)).toBe(false)
            expect(isString(true)).toBe(false)
            expect(isString(null)).toBe(false)
            expect(isString(undefined)).toBe(false)
            expect(isString({})).toBe(false)
            expect(isString([])).toBe(false)
        })
    })

    describe('isNumber', () => {
        it('should return true for valid numbers', () => {
            expect(isNumber(123)).toBe(true)
            expect(isNumber(0)).toBe(true)
            expect(isNumber(-123)).toBe(true)
            expect(isNumber(123.45)).toBe(true)
        })

        it('should return false for invalid numbers', () => {
            expect(isNumber(NaN)).toBe(false)
            expect(isNumber(Infinity)).toBe(true) // Infinity is a valid number
            expect(isNumber('123')).toBe(false)
            expect(isNumber(true)).toBe(false)
            expect(isNumber(null)).toBe(false)
            expect(isNumber(undefined)).toBe(false)
        })
    })

    describe('isBoolean', () => {
        it('should return true for booleans', () => {
            expect(isBoolean(true)).toBe(true)
            expect(isBoolean(false)).toBe(true)
        })

        it('should return false for non-booleans', () => {
            expect(isBoolean(1)).toBe(false)
            expect(isBoolean(0)).toBe(false)
            expect(isBoolean('true')).toBe(false)
            expect(isBoolean(null)).toBe(false)
            expect(isBoolean(undefined)).toBe(false)
        })
    })

    describe('isObject', () => {
        it('should return true for objects', () => {
            expect(isObject({})).toBe(true)
            expect(isObject({ a: 1 })).toBe(true)
            expect(isObject(new Date())).toBe(true)
        })

        it('should return false for non-objects', () => {
            expect(isObject(null)).toBe(false)
            expect(isObject([])).toBe(false)
            expect(isObject('string')).toBe(false)
            expect(isObject(123)).toBe(false)
            expect(isObject(undefined)).toBe(false)
        })
    })

    describe('isArray', () => {
        it('should return true for arrays', () => {
            expect(isArray([])).toBe(true)
            expect(isArray([1, 2, 3])).toBe(true)
            expect(isArray(['a', 'b'])).toBe(true)
        })

        it('should return false for non-arrays', () => {
            expect(isArray({})).toBe(false)
            expect(isArray('string')).toBe(false)
            expect(isArray(123)).toBe(false)
            expect(isArray(null)).toBe(false)
            expect(isArray(undefined)).toBe(false)
        })
    })

    describe('isNonEmptyString', () => {
        it('should return true for non-empty strings', () => {
            expect(isNonEmptyString('hello')).toBe(true)
            expect(isNonEmptyString('123')).toBe(true)
        })

        it('should return false for empty or non-strings', () => {
            expect(isNonEmptyString('')).toBe(false)
            expect(isNonEmptyString('   ')).toBe(false)
            expect(isNonEmptyString(123)).toBe(false)
            expect(isNonEmptyString(null)).toBe(false)
            expect(isNonEmptyString(undefined)).toBe(false)
        })
    })

    describe('isNonEmptyArray', () => {
        it('should return true for non-empty arrays', () => {
            expect(isNonEmptyArray([1])).toBe(true)
            expect(isNonEmptyArray([1, 2, 3])).toBe(true)
            expect(isNonEmptyArray(['a'])).toBe(true)
        })

        it('should return false for empty arrays or non-arrays', () => {
            expect(isNonEmptyArray([])).toBe(false)
            expect(isNonEmptyArray({})).toBe(false)
            expect(isNonEmptyArray('string')).toBe(false)
            expect(isNonEmptyArray(null)).toBe(false)
        })
    })

    describe('isGuildId', () => {
        it('should return true for valid guild IDs', () => {
            expect(isGuildId('123456789012345678')).toBe(true)
            expect(isGuildId('987654321098765432')).toBe(true)
        })

        it('should return false for invalid guild IDs', () => {
            expect(isGuildId('123')).toBe(false)
            expect(isGuildId('invalid')).toBe(false)
            expect(isGuildId('1234567890123456789')).toBe(true) // 19 digits is valid
            expect(isGuildId('12345678901234567890')).toBe(false) // 20 digits is invalid
            expect(isGuildId('')).toBe(false)
        })
    })

    describe('isUserId', () => {
        it('should return true for valid user IDs', () => {
            expect(isUserId('123456789012345678')).toBe(true)
            expect(isUserId('987654321098765432')).toBe(true)
        })

        it('should return false for invalid user IDs', () => {
            expect(isUserId('123')).toBe(false)
            expect(isUserId('invalid')).toBe(false)
            expect(isUserId('')).toBe(false)
        })
    })

    describe('isChannelId', () => {
        it('should return true for valid channel IDs', () => {
            expect(isChannelId('123456789012345678')).toBe(true)
            expect(isChannelId('987654321098765432')).toBe(true)
        })

        it('should return false for invalid channel IDs', () => {
            expect(isChannelId('123')).toBe(false)
            expect(isChannelId('invalid')).toBe(false)
            expect(isChannelId('')).toBe(false)
        })
    })

    describe('isYouTubeUrl', () => {
        it('should return true for valid YouTube URLs', () => {
            expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
            expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
            expect(isYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
        })

        it('should return false for invalid YouTube URLs', () => {
            expect(isYouTubeUrl('https://example.com')).toBe(false)
            expect(isYouTubeUrl('https://spotify.com/track/123')).toBe(false)
            expect(isYouTubeUrl('not a url')).toBe(false)
            expect(isYouTubeUrl('')).toBe(false)
        })
    })

    describe('isSpotifyUrl', () => {
        it('should return true for valid Spotify URLs', () => {
            expect(isSpotifyUrl('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')).toBe(true)
            expect(isSpotifyUrl('https://spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true)
            expect(isSpotifyUrl('https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo')).toBe(true)
        })

        it('should return false for invalid Spotify URLs', () => {
            expect(isSpotifyUrl('https://youtube.com/watch?v=123')).toBe(false)
            expect(isSpotifyUrl('https://example.com')).toBe(false)
            expect(isSpotifyUrl('not a url')).toBe(false)
            expect(isSpotifyUrl('')).toBe(false)
        })
    })

    describe('isDiscordInvite', () => {
        it('should return true for valid Discord invite URLs', () => {
            expect(isDiscordInvite('https://discord.gg/abc123')).toBe(true)
            expect(isDiscordInvite('https://discordapp.com/invite/xyz789')).toBe(true)
        })

        it('should return false for invalid Discord invite URLs', () => {
            expect(isDiscordInvite('https://youtube.com/watch?v=123')).toBe(false)
            expect(isDiscordInvite('https://example.com')).toBe(false)
            expect(isDiscordInvite('not a url')).toBe(false)
            expect(isDiscordInvite('')).toBe(false)
        })
    })

    describe('hasProperty', () => {
        it('should return true when object has property', () => {
            expect(hasProperty({ a: 1 }, 'a')).toBe(true)
            expect(hasProperty({ name: 'test' }, 'name')).toBe(true)
        })

        it('should return false when object does not have property', () => {
            expect(hasProperty({ a: 1 }, 'b')).toBe(false)
            expect(hasProperty({}, 'any')).toBe(false)
            expect(hasProperty(null, 'any')).toBe(false)
            expect(hasProperty(undefined, 'any')).toBe(false)
        })
    })

    describe('isFunction', () => {
        it('should return true for functions', () => {
            expect(isFunction(() => {})).toBe(true)
            expect(isFunction(function() {})).toBe(true)
            expect(isFunction(Math.max)).toBe(true)
        })

        it('should return false for non-functions', () => {
            expect(isFunction('string')).toBe(false)
            expect(isFunction(123)).toBe(false)
            expect(isFunction({})).toBe(false)
            expect(isFunction(null)).toBe(false)
            expect(isFunction(undefined)).toBe(false)
        })
    })

    describe('isPromise', () => {
        it('should return true for promises', () => {
            expect(isPromise(Promise.resolve())).toBe(true)
            expect(isPromise(new Promise(() => {}))).toBe(true)
        })

        it('should return false for non-promises', () => {
            expect(isPromise('string')).toBe(false)
            expect(isPromise(123)).toBe(false)
            expect(isPromise({})).toBe(false)
            expect(isPromise(null)).toBe(false)
            expect(isPromise(undefined)).toBe(false)
        })
    })

    describe('isError', () => {
        it('should return true for errors', () => {
            expect(isError(new Error())).toBe(true)
            expect(isError(new TypeError())).toBe(true)
            expect(isError(new ReferenceError())).toBe(true)
        })

        it('should return false for non-errors', () => {
            expect(isError('string')).toBe(false)
            expect(isError(123)).toBe(false)
            expect(isError({})).toBe(false)
            expect(isError(null)).toBe(false)
            expect(isError(undefined)).toBe(false)
        })
    })
})
