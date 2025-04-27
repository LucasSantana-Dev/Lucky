import { randomUUID } from 'node:crypto';
export const generateFileName = ({ fileExt }) => {
    return `${randomUUID()}.${fileExt}`;
};
//# sourceMappingURL=generateFileName.js.map