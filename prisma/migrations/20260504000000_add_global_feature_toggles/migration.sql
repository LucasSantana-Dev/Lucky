CREATE TABLE "global_feature_toggles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "global_feature_toggles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "global_feature_toggles_name_key" ON "global_feature_toggles"("name");
