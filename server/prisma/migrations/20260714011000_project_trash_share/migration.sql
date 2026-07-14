-- Project soft-delete (trash) + public share tokens
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Project_shareToken_key" ON "Project"("shareToken");
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
