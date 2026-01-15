import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import { randomBytes } from 'crypto'

class OAuthStateService {
    private readonly statePrefix = 'webapp:oauth:state:'
    private readonly stateTtl = 5 * 60

    private getStateKey(state: string): string {
        return `${this.statePrefix}${state}`
    }

    generateState(): string {
        return randomBytes(32).toString('hex')
    }

    async storeState(state: string): Promise<void> {
        try {
            if (!redisClient.isHealthy()) {
                throw new Error('Redis client not available')
            }

            const key = this.getStateKey(state)
            await redisClient.setex(key, this.stateTtl, '1')
            debugLog({
                message: 'OAuth state stored',
                data: { state: state.substring(0, 8) },
            })
        } catch (error) {
            errorLog({ message: 'Error storing OAuth state:', error })
            throw error
        }
    }

    async validateState(state: string): Promise<boolean> {
        try {
            if (!redisClient.isHealthy()) {
                errorLog({
                    message:
                        'Redis client not available, cannot validate state',
                })
                return false
            }

            const key = this.getStateKey(state)
            const exists = await redisClient.exists(key)

            if (exists) {
                await redisClient.del(key)
                debugLog({
                    message: 'OAuth state validated and cleared',
                    data: { state: state.substring(0, 8) },
                })
                return true
            }

            errorLog({
                message: 'Invalid or expired OAuth state',
                data: { state: state.substring(0, 8) },
            })
            return false
        } catch (error) {
            errorLog({ message: 'Error validating OAuth state:', error })
            return false
        }
    }
}

export const oauthStateService = new OAuthStateService()
