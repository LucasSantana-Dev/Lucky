-- CommandUsage was dead code: no production writer ever existed (issue #1341),
-- so the table is empty in every environment. Drop it outright.
DROP TABLE IF EXISTS "command_usage";
