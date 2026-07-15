-- Categories become workspace-scoped and user-managed (create/rename/delete),
-- replacing the fixed global 5-category list. Project.categoryId becomes
-- optional (a deleted category un-categorizes its projects instead of taking
-- them with it).

-- 1. New columns on Category, and relax the Project -> Category relationship.
ALTER TABLE "Category" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Category" ADD COLUMN "color" TEXT;
ALTER TABLE "Category" ADD COLUMN "ord" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Project" DROP CONSTRAINT "Project_categoryId_fkey";
ALTER TABLE "Project" ALTER COLUMN "categoryId" DROP NOT NULL;

-- 2. Give the old fixed categories a color (so the workspace-scoped copies
--    created below inherit the same swatches the UI already hardcoded).
UPDATE "Category" SET "color" = CASE "id"
  WHEN 'dt' THEN '#0EA5E9' WHEN 'sf' THEN '#10B981' WHEN 'infra' THEN '#6366F1'
  WHEN 'kaizen' THEN '#F59E0B' WHEN 'it' THEN '#64748B' ELSE '#6366F1' END
WHERE "workspaceId" IS NULL;

-- 3. Create one workspace-scoped copy per (workspace, category) pair actually
--    referenced by a project, and repoint those projects at the new copy.
CREATE TABLE "_cat_migration_map" AS
SELECT gen_random_uuid()::text AS new_id, u."workspaceId" AS ws_id, c.id AS old_id, c.label, c.color
FROM (SELECT DISTINCT "workspaceId", "categoryId" FROM "Project" WHERE "categoryId" IS NOT NULL) u
JOIN "Category" c ON c.id = u."categoryId";

INSERT INTO "Category" (id, label, "workspaceId", color, ord)
SELECT new_id, label, ws_id, color, 0 FROM "_cat_migration_map";

UPDATE "Project" p SET "categoryId" = m.new_id
FROM "_cat_migration_map" m
WHERE p."workspaceId" = m.ws_id AND p."categoryId" = m.old_id;

DROP TABLE "_cat_migration_map";

-- 4. Drop the old unscoped rows (now unreferenced — every project was repointed
--    above) and lock the column down.
DELETE FROM "Category" WHERE "workspaceId" IS NULL;

ALTER TABLE "Category" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE INDEX "Category_workspaceId_idx" ON "Category"("workspaceId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
