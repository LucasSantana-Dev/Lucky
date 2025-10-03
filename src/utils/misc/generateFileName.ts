import { randomUUID } from "node:crypto"

type GenerateFileNameParams = {
    fileExt: string
}

export const generateFileName = ({
    fileExt,
}: GenerateFileNameParams): string => {
    return `${randomUUID()}.${fileExt}`
}
