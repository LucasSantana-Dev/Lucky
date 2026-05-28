/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/tests/**/*.test.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/generated/**',
    '!src/config/**',
    '!src/constants/**',
    '!src/services/redis/**',
    '!src/utils/database/**',
    '!src/utils/ffmpeg/**',
    '!src/services/music/**',
    '!src/utils/dependency/**',
    '!src/services/database/**',
    '!src/services/ReactionRolesService/**',
    '!src/services/RoleManagementService/**',
    '!src/services/TwitchNotificationService/**',
    '!src/services/AutoMessageService.ts',
    '!src/services/AutoModService.ts',
    '!src/services/AutoRoleService.ts',
    '!src/services/CustomCommandService.ts',
    '!src/services/EmbedBuilderService.ts',
    '!src/services/GuildRoleAccessService.ts',
    '!src/services/GuildSettingsService.ts',
    '!src/services/LevelService.ts',
    '!src/services/LyricsService.ts',
    '!src/services/ModerationService.ts',
    '!src/services/ServerLogService.ts',
    '!src/services/StarboardService.ts',
    '!src/services/TrackHistoryService.ts',
    '!src/services/guildCounters.ts',
    '!src/services/moderationSettings.ts',
    '!src/services/serverLogHelpers.ts',
    '!src/services/guildAutomation/GuildAutomationOrchestrator.ts',
    '!src/services/guildAutomation/GuildAutomationRepository.ts',
    '!src/services/guildAutomation/service.ts',
    '!src/services/guildAutomation/onboardingMapper.ts',
    '!src/services/guildAutomation/guildAutomationHelpers.ts',
    '!src/services/guildAutomation/index.ts',
    '!src/services/index.ts',
    '!src/index.ts',
    '!src/utils/index.ts',
    '!src/types/index.ts',
    '!src/types/errors/index.ts',
    '!src/utils/errorHandler.ts',
    '!src/utils/general/deferredInteractionReply.ts',
    '!src/utils/requiredDatabaseRelations.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^discord$': 'discord.js',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
      extensionsToTreatAsEsm: ['.ts']
    }],
    '^.+\\.js$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'esnext'
      }
    }]
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  verbose: true,
  clearMocks: true,
  restoreMocks: true
}
