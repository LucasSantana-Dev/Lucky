import { randomUUID } from 'node:crypto';

interface GenerateFileNameParams {
  fileExt: string;
}

export const generateFileName = ({ fileExt }: GenerateFileNameParams): string => {
  return `${randomUUID()}.${fileExt}`;
} 