import { v4 as uuidv4 } from 'uuid';

export const generateFileName = ({ fileExt }) => {
  return `${uuidv4()}.${fileExt}`;
}