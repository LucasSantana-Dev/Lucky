/**
 * Service Factory - Direct service instantiation without over-abstraction
 */

import { TrackHistoryService } from './TrackHistoryService'
import { GuildSettingsService } from './GuildSettingsService'
import { SessionService } from './SessionService'
import { DatabaseService } from './database/DatabaseService'
import { infoLog, errorLog } from '../utils/general/log'

export interface ServiceConfig {
  ttl: number
  maxHistorySize: number
  trackHistoryTtl: number
  metadataTtl: number
}

export class ServiceFactory {
  private static instances: Map<string, TrackHistoryService | GuildSettingsService | SessionService | DatabaseService> = new Map()

  static getTrackHistoryService(config?: Partial<ServiceConfig>): TrackHistoryService {
    const serviceName = 'trackHistory'
    const defaultConfig = {
      maxHistorySize: 100,
      trackHistoryTtl: 7 * 24 * 60 * 60, // 7 days
      metadataTtl: 24 * 60 * 60, // 1 day
    }

    if (!ServiceFactory.instances.has(serviceName)) {
      const finalConfig = { ...defaultConfig, ...config }
      const instance = new TrackHistoryService(finalConfig.ttl, finalConfig.maxHistorySize)
      ServiceFactory.instances.set(serviceName, instance)
      infoLog({ message: 'Created TrackHistoryService instance' })
    }

    return ServiceFactory.instances.get(serviceName) as TrackHistoryService
  }

  static getGuildSettingsService(config?: Partial<ServiceConfig>): GuildSettingsService {
    const serviceName = 'guildSettings'
    const defaultConfig = {
      ttl: 7 * 24 * 60 * 60, // 7 days
    }

    if (!ServiceFactory.instances.has(serviceName)) {
      const finalConfig = { ...defaultConfig, ...config }
      const instance = new GuildSettingsService(finalConfig.ttl)
      ServiceFactory.instances.set(serviceName, instance)
      infoLog({ message: 'Created GuildSettingsService instance' })
    }

    return ServiceFactory.instances.get(serviceName) as GuildSettingsService
  }

  static getSessionService(config?: Partial<ServiceConfig>): SessionService {
    const serviceName = 'session'
    const defaultConfig = {
      ttl: 24 * 60 * 60, // 24 hours
    }

    if (!ServiceFactory.instances.has(serviceName)) {
      const finalConfig = { ...defaultConfig, ...config }
      const instance = new SessionService(finalConfig.ttl)
      ServiceFactory.instances.set(serviceName, instance)
      infoLog({ message: 'Created SessionService instance' })
    }

    return ServiceFactory.instances.get(serviceName) as SessionService
  }

  static getDatabaseService(config?: Partial<{ ttl: number; maxConnections: number; connectionTimeout: number }>): DatabaseService | null {
    const serviceName = 'database'

    if (!ServiceFactory.instances.has(serviceName)) {
      if (!process.env.DATABASE_URL) {
        infoLog({ message: 'DATABASE_URL not configured, skipping database service' })
        return null
      }

      try {
        const defaultConfig = {
          url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydb',
          ttl: 7 * 24 * 60 * 60 * 60,
          maxConnections: 10,
          connectionTimeout: 30000,
        }

        const finalConfig = { ...defaultConfig, ...config }
        const instance = new DatabaseService(finalConfig)
        ServiceFactory.instances.set(serviceName, instance)
        infoLog({ message: 'Created DatabaseService instance' })
      } catch (error) {
        errorLog({ message: 'Failed to create DatabaseService', error })
        return null
      }
    }

    return ServiceFactory.instances.get(serviceName) as DatabaseService
  }

  static async initializeAllServices(): Promise<{ success: boolean; services: string[]; errors: string[] }> {
    const services: string[] = []
    const errors: string[] = []

    try {
      // Initialize core services
      ServiceFactory.getTrackHistoryService()
      services.push('trackHistory')

      ServiceFactory.getGuildSettingsService()
      services.push('guildSettings')

      ServiceFactory.getSessionService()
      services.push('session')

      // Initialize database service if available
      const databaseService = ServiceFactory.getDatabaseService()
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

  static getServiceStatus(): Record<string, { status: string; lastCheck: Date }> {
    const status: Record<string, { status: string; lastCheck: Date }> = {}

    for (const [name, instance] of ServiceFactory.instances) {
      status[name] = {
        status: instance ? 'active' : 'inactive',
        lastCheck: new Date(),
      }
    }

    return status
  }

  static clearAllInstances(): void {
    ServiceFactory.instances.clear()
    infoLog({ message: 'Cleared all service instances' })
  }

  static getInstanceCount(): number {
    return ServiceFactory.instances.size
  }

  static hasService(serviceName: string): boolean {
    return ServiceFactory.instances.has(serviceName)
  }

  static getServiceNames(): string[] {
    return Array.from(ServiceFactory.instances.keys())
  }
}
