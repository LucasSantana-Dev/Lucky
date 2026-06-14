import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import type { SessionData } from 'express-session'
import { PrismaSessionStore } from '../../../src/middleware/prismaSessionStore'

type SessionDelegate = {
    findUnique: jest.Mock
    upsert: jest.Mock
    delete: jest.Mock
    update: jest.Mock
    deleteMany: jest.Mock
}

function createFakeDb(): { session: SessionDelegate } {
    return {
        session: {
            findUnique: jest.fn(),
            upsert: jest.fn(() => Promise.resolve({})),
            delete: jest.fn(() => Promise.resolve({})),
            update: jest.fn(() => Promise.resolve({})),
            deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
        },
    }
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
    return {
        cookie: {
            originalMaxAge: 1000,
            maxAge: 1000,
            httpOnly: true,
            path: '/',
        },
        ...overrides,
    } as SessionData
}

function newStore(db: { session: SessionDelegate }, ttlMs?: number) {
    return new PrismaSessionStore(
        db as unknown as ConstructorParameters<typeof PrismaSessionStore>[0],
        ttlMs,
    )
}

describe('PrismaSessionStore', () => {
    let db: { session: SessionDelegate }
    let store: PrismaSessionStore

    beforeEach(() => {
        db = createFakeDb()
        store = newStore(db)
    })

    afterEach(() => {
        store.stopPruning()
    })

    describe('get', () => {
        test('returns null when the session does not exist', (done) => {
            db.session.findUnique.mockResolvedValue(null)
            store.get('missing', (err, data) => {
                expect(err).toBeNull()
                expect(data).toBeNull()
                done()
            })
        })

        test('returns the parsed session when present and unexpired', (done) => {
            const future = new Date(Date.now() + 60_000)
            const payload = makeSession({
                userId: 'u1',
            } as Partial<SessionData>)
            db.session.findUnique.mockResolvedValue({
                sid: 's1',
                data: JSON.stringify(payload),
                expiresAt: future,
            })
            store.get('s1', (err, data) => {
                expect(err).toBeNull()
                expect(data).toMatchObject({ userId: 'u1' })
                done()
            })
        })

        test('evicts and returns null for an expired row', (done) => {
            const past = new Date(Date.now() - 60_000)
            db.session.findUnique.mockResolvedValue({
                sid: 's1',
                data: JSON.stringify(makeSession()),
                expiresAt: past,
            })
            store.get('s1', (err, data) => {
                expect(err).toBeNull()
                expect(data).toBeNull()
                expect(db.session.delete).toHaveBeenCalledWith({
                    where: { sid: 's1' },
                })
                done()
            })
        })

        test('treats a corrupt payload as no session', (done) => {
            db.session.findUnique.mockResolvedValue({
                sid: 's1',
                data: '{not json',
                expiresAt: new Date(Date.now() + 60_000),
            })
            store.get('s1', (err, data) => {
                expect(err).toBeNull()
                expect(data).toBeNull()
                done()
            })
        })

        test('propagates a database error', (done) => {
            const boom = new Error('db down')
            db.session.findUnique.mockRejectedValue(boom)
            store.get('s1', (err) => {
                expect(err).toBe(boom)
                done()
            })
        })
    })

    describe('set', () => {
        test('upserts with the cookie expiry when present', (done) => {
            const expires = new Date(Date.now() + 123_456)
            const sess = makeSession()
            sess.cookie.expires = expires
            store.set('s1', sess, (err) => {
                expect(err).toBeUndefined()
                expect(db.session.upsert).toHaveBeenCalledTimes(1)
                const arg = db.session.upsert.mock.calls[0][0] as {
                    where: { sid: string }
                    create: { sid: string; data: string; expiresAt: Date }
                    update: { data: string; expiresAt: Date }
                }
                expect(arg.where.sid).toBe('s1')
                expect(arg.create.expiresAt).toEqual(expires)
                expect(JSON.parse(arg.create.data)).toMatchObject({
                    cookie: expect.any(Object),
                })
                done()
            })
        })

        test('falls back to the configured ttl when no cookie expiry', (done) => {
            const store2 = newStore(db, 10_000)
            const before = Date.now()
            store2.set('s2', makeSession(), () => {
                const arg = db.session.upsert.mock.calls[0][0] as {
                    create: { expiresAt: Date }
                }
                const ts = arg.create.expiresAt.getTime()
                expect(ts).toBeGreaterThanOrEqual(before + 10_000)
                expect(ts).toBeLessThanOrEqual(Date.now() + 10_000)
                store2.stopPruning()
                done()
            })
        })

        test('reports an upsert error to the callback', (done) => {
            const boom = new Error('write failed')
            db.session.upsert.mockRejectedValue(boom)
            store.set('s1', makeSession(), (err) => {
                expect(err).toBe(boom)
                done()
            })
        })
    })

    describe('destroy', () => {
        test('deletes the row', (done) => {
            store.destroy('s1', (err) => {
                expect(err).toBeUndefined()
                expect(db.session.delete).toHaveBeenCalledWith({
                    where: { sid: 's1' },
                })
                done()
            })
        })

        test('treats a missing row (P2025) as success', (done) => {
            db.session.delete.mockRejectedValue({ code: 'P2025' })
            store.destroy('gone', (err) => {
                expect(err).toBeUndefined()
                done()
            })
        })

        test('propagates other delete errors', (done) => {
            const boom = new Error('constraint')
            db.session.delete.mockRejectedValue(boom)
            store.destroy('s1', (err) => {
                expect(err).toBe(boom)
                done()
            })
        })
    })

    describe('touch', () => {
        test('refreshes the expiry', (done) => {
            store.touch('s1', makeSession(), () => {
                expect(db.session.update).toHaveBeenCalledTimes(1)
                const arg = db.session.update.mock.calls[0][0] as {
                    where: { sid: string }
                    data: { expiresAt: Date }
                }
                expect(arg.where.sid).toBe('s1')
                expect(arg.data.expiresAt).toBeInstanceOf(Date)
                done()
            })
        })

        test('does not error when the row is missing', (done) => {
            db.session.update.mockRejectedValue({ code: 'P2025' })
            store.touch('gone', makeSession(), (err) => {
                expect(err).toBeUndefined()
                done()
            })
        })

        test('propagates non-P2025 errors so failover can trigger', (done) => {
            const boom = new Error('connection lost')
            db.session.update.mockRejectedValue(boom)
            store.touch('s1', makeSession(), (err) => {
                expect(err).toBe(boom)
                done()
            })
        })
    })

    describe('prune', () => {
        test('deletes expired rows', async () => {
            db.session.deleteMany.mockResolvedValue({ count: 3 })
            await store.prune()
            const arg = db.session.deleteMany.mock.calls[0][0] as {
                where: { expiresAt: { lte: Date } }
            }
            expect(arg.where.expiresAt.lte).toBeInstanceOf(Date)
        })

        test('swallows prune errors', async () => {
            db.session.deleteMany.mockRejectedValue(new Error('prune boom'))
            await expect(store.prune()).resolves.toBeUndefined()
        })
    })
})
