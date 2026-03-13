import { verifyRequiredDatabaseRelations } from '@lucky/shared/utils'

export async function verifyRequiredDatabaseState(): Promise<void> {
    await verifyRequiredDatabaseRelations()
}
