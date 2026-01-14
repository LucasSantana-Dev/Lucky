/**
 * Service Factory - Helper for service initialization
 * Services should export singleton instances directly when needed
 */

import { trackHistoryService } from './TrackHistoryService'
import { guildSettingsService } from './GuildSettingsService'
import { sessionService } from './SessionService'
import { DatabaseService } from './database/DatabaseService'
import { infoLog, errorLog } from '../utils/general/log'

export interface ServiceConfig {
  ttl?: number
  maxHistorySize?: number
}

export class ServiceFactory {
  static getTrackHistoryService() {
    return trackHistoryService
  }

  static getGuildSettingsService() {
    return guildSettingsService
  }

  static getSessionService() {
    return sessionService
  }

  static createDatabaseService(config?: {
    ttl?: number
    maxConnections?: number
    connectionTimeout?: number
  }): DatabaseService | null {
    if (!process.env.DATABASE_URL) {
      infoLog({ message: 'DATABASE_URL not configured, skipping database service' })
      return null
    }

    try {
      const defaultConfig = {
        url: process.env.DATABASE_URL,
        ttl: 7 * 24 * 60 * 60,
        maxConnections: 10,
        connectionTimeout: 30000,
      }

      const finalConfig = { ...defaultConfig, ...config }
      return new DatabaseService(finalConfig)
    } catch (error) {
      errorLog({ message: 'Failed to create DatabaseService', error })
      return null
    }
  }

  static async initializeAllServices(): Promise<{ success: boolean; services: string[]; errors: string[] }> {
    const services: string[] = []
    const errors: string[] = []

    try {
      ServiceFactory.getTrackHistoryService()
      services.push('trackHistory')

      ServiceFactory.getGuildSettingsService()
      services.push('guildSettings')

      ServiceFactory.getSessionService()
      services.push('session')

      const databaseService = ServiceFactory.createDatabaseService()
      if (databaseService) {
        const connectResult = await databaseService.connect()
        if (connectResult.isSuccess() && connectResult.getData()) {
          services.push('database')
        } else {
          errors.push('Failed to connect to database')
        }
      }

      infoLog({ message: `Initialized ${services.length} services: ${services.join(', ')}` })
      return { success: true, services, errors }
    } catch (error) {
      errorLog({ message: 'Failed to initialize services', error })
      return { success: false, services, errors: [error instanceof Error ? error.message : 'Unknown error'] }
    }
  }
}
