/**
 * Database initialization service
 */

import { DatabaseService, type DatabaseConfig } from './DatabaseService'
import { infoLog, errorLog, debugLog } from '../../utils/general/log'

export interface DatabaseInitializationResult {
  success: boolean
  services: string[]
  error?: string
}

export interface DatabaseServiceStatus {
  service: string
  status: 'connected' | 'disconnected' | 'error'
  lastCheck: Date
  error?: string
}

export class DatabaseInitializationService {
  private isInitialized = false
  private databaseService: DatabaseService | null = null

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      debugLog({ message: 'Database services already initialized' })
      return true
    }

    try {
      infoLog({ message: 'Initializing database services...' })

      // Check if DATABASE_URL is configured
      if (!process.env.DATABASE_URL) {
        errorLog({ message: 'DATABASE_URL not configured, skipping database initialization' })
        return false
      }

      // Initialize database service
      const config: DatabaseConfig = {
        url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydb',
        ttl: 7 * 24 * 60 * 60 * 60, // 7 days
        maxConnections: 10,
        connectionTimeout: 30000, // 30 seconds
      }

      this.databaseService = new DatabaseService(config)

      // Connect to database
      const connectResult = await this.databaseService.connect()
      if (!connectResult.isSuccess() || !connectResult.getData()) {
        errorLog({ message: 'Failed to connect to database' })
        return false
      }

      // Test database connection
      const healthResult = await this.databaseService.isHealthy()
      if (!healthResult.isSuccess() || !healthResult.getData()) {
        errorLog({ message: 'Database connection is not healthy' })
        return false
      }

      this.isInitialized = true
      infoLog({ message: 'Database services initialized successfully' })
      return true
    } catch (error) {
      errorLog({
        message: 'Failed to initialize database services:',
        error,
      })
      return false
    }
  }

  async getServiceStatus(): Promise<DatabaseServiceStatus[]> {
    const statuses: DatabaseServiceStatus[] = []

    if (this.databaseService) {
      const healthResult = await this.databaseService.isHealthy()
      statuses.push({
        service: 'database',
        status: healthResult.isSuccess() && healthResult.getData() ? 'connected' : 'error',
        lastCheck: new Date(),
        error: healthResult.isFailure() ? healthResult.getError()?.message : undefined,
      })
    } else {
      statuses.push({
        service: 'database',
        status: 'disconnected',
        lastCheck: new Date(),
        error: 'Database service not initialized',
      })
    }

    return statuses
  }

  getDatabaseService(): DatabaseService | null {
    return this.databaseService
  }

  async shutdown(): Promise<void> {
    if (this.databaseService) {
      await this.databaseService.disconnect()
    }
    this.isInitialized = false
  }
}
