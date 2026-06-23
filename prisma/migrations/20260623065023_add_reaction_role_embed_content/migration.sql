-- Persist the embed content (title/description/imageUrl) on reaction role
-- messages so the dashboard edit form can prefill them. Nullable: rows created
-- before this migration have no stored embed content.
ALTER TABLE "reaction_role_messages" ADD COLUMN "title" TEXT;
ALTER TABLE "reaction_role_messages" ADD COLUMN "description" TEXT;
ALTER TABLE "reaction_role_messages" ADD COLUMN "imageUrl" TEXT;
