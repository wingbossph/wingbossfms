-- COGS expense categories: Grocery, Ingredients, Others (for existing charts;
-- new databases get them from the seed template).
INSERT INTO "Account" ("id", "code", "name", "type", "groupId", "isPostable", "isIntercompany", "isActive")
SELECT 'acct_cogs_' || v.code, v.code, v.name, 'EXPENSE', g."id", true, false, true
FROM "AccountGroup" g
CROSS JOIN (VALUES ('5085', 'Grocery'), ('5086', 'Ingredients'), ('5087', 'Others')) AS v(code, name)
WHERE g."code" = 'COGS'
ON CONFLICT ("code") DO NOTHING;
