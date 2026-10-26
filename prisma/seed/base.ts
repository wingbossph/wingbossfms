// Base data for every database: permissions + roles, chart of accounts, the
// 4 locations, money accounts, payment channels, discount types, demo users,
// items and the placeholder menu. Used by the seed and by integration tests.

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";
import { DEFAULT_ROLES, PERMISSIONS } from "@/server/auth/permissions";
import { ACCOUNTS, ACCOUNT_GROUPS, accountTypeForGroup } from "@/domains/ledger/coa-template";
import { createMoneyAccount } from "@/domains/cash/money-accounts";
import { createLocation } from "@/domains/admin/locations";
import { ITEMS, ITEM_CATEGORIES, PRODUCTS } from "./catalog";

export const DEMO_PASSWORD = "Wingboss2026!";

async function seedPermissionsAndRoles(tx: Tx) {
  for (const p of PERMISSIONS) {
    await tx.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, module: p.module, description: p.description },
      update: { module: p.module, description: p.description },
    });
  }
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await tx.role.create({
      data: {
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
    roles[r.key] = role.id;
  }
  return roles;
}

async function seedChartOfAccounts(tx: Tx) {
  const groupIds: Record<string, string> = {};
  for (const [i, g] of ACCOUNT_GROUPS.entries()) {
    const group = await tx.accountGroup.create({
      data: {
        code: g.code,
        name: g.name,
        section: g.section,
        kpiTag: g.kpiTag ?? "NONE",
        isVariable: g.isVariable ?? false,
        sortOrder: i * 10,
      },
    });
    groupIds[g.code] = group.id;
  }
  const accountIds: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const account = await tx.account.create({
      data: {
        code: a.code,
        name: a.name,
        type: accountTypeForGroup(a.group),
        groupId: groupIds[a.group],
        parentId: a.parent ? accountIds[a.parent] : null,
        isPostable: !a.header,
        systemKey: a.systemKey ?? null,
        isIntercompany: a.isIntercompany ?? false,
      },
    });
    accountIds[a.code] = account.id;
  }
}

async function accountIdByKey(tx: Tx, systemKey: string) {
  return (await tx.account.findUniqueOrThrow({ where: { systemKey } })).id;
}

export async function seedBase(db: PrismaClient, opts: { ownerEmail: string; ownerPassword: string }) {
  return db.$transaction(
    async (tx) => {
      const roles = await seedPermissionsAndRoles(tx);
      await seedChartOfAccounts(tx);

      // Settings use code defaults (src/domains/admin/settings.ts) until the Owner changes them.

      const taxEntity = await tx.taxEntity.create({
        data: { registeredName: "Wingboss (set registered name)", tin: "000-000-000", branchCode: "000" },
      });

      // ── Shared payment channels need their money accounts first ────────
      const bpi = await createMoneyAccount(tx, { name: "BPI Bank", kind: "BANK", locationId: null, institution: "BPI" });
      const gcash1 = await createMoneyAccount(tx, { name: "GCash 1", kind: "EWALLET", locationId: null, institution: "GCash" });
      const gcash2 = await createMoneyAccount(tx, {
        name: "GCash 2",
        kind: "EWALLET",
        locationId: null,
        institution: "GCash",
        isPersonal: true,
      });
      const maya = await createMoneyAccount(tx, {
        name: "Maya terminal / merchant wallet",
        kind: "CARD_CLEARING",
        locationId: null,
        institution: "Maya",
      });
      const grab = await createMoneyAccount(tx, {
        name: "GrabFood receivable",
        kind: "PLATFORM_RECEIVABLE",
        locationId: null,
        institution: "Grab",
      });
      await createMoneyAccount(tx, { name: "Owner's personal funds", kind: "OWNER_PERSONAL", locationId: null });

      // Fee rates are placeholders: the Owner sets the real MDR/commission in Admin.
      const channelDefs = [
        { name: "Cash", kind: "CASH", moneyAccountId: null },
        { name: "Maya Card", kind: "CARD", moneyAccountId: maya.id, isDeferred: true, feeRateBp: 250, settlementDelayDays: 1, settlesToMoneyAccountId: bpi.id },
        { name: "Maya QR / QR Ph", kind: "QR", moneyAccountId: maya.id, isDeferred: true, feeRateBp: 150, settlementDelayDays: 1, settlesToMoneyAccountId: bpi.id },
        { name: "GCash 1", kind: "EWALLET", moneyAccountId: gcash1.id },
        { name: "GCash 2", kind: "EWALLET", moneyAccountId: gcash2.id },
        { name: "Bank transfer (BPI)", kind: "BANK_TRANSFER", moneyAccountId: bpi.id },
        { name: "GrabFood", kind: "DELIVERY_PLATFORM", moneyAccountId: grab.id, isDeferred: true, feeRateBp: 3000, settlementDelayDays: 7, settlesToMoneyAccountId: bpi.id },
      ] as const;
      const channelIds: string[] = [];
      for (const [i, c] of channelDefs.entries()) {
        const channel = await tx.paymentChannel.create({ data: { ...c, sortOrder: i } });
        channelIds.push(channel.id);
      }

      // ── Users (before locations so staff can be assigned in one step) ──
      const ownerEmail = opts.ownerEmail.toLowerCase();
      const ownerPassword = opts.ownerPassword;
      const hash = (s: string) => bcrypt.hashSync(s, 10);

      const owner = await tx.user.create({
        data: { name: "Owner", email: ownerEmail, passwordHash: hash(ownerPassword), pinHash: hash("1111"), isOwner: true },
      });
      await tx.roleAssignment.create({ data: { userId: owner.id, roleId: roles.owner, locationId: null } });

      const admin = await tx.user.create({
        data: { name: "Ana Admin", email: "admin@wingboss.ph", passwordHash: hash(DEMO_PASSWORD), pinHash: hash("2222") },
      });
      const cashiers = await Promise.all(
        [
          ["Carlo Matina", "3001"],
          ["Mika Matina", "3002"],
          ["Lito Lanang", "4001"],
          ["Joy Lanang", "4002"],
        ].map(([name, pin]) => tx.user.create({ data: { name, pinHash: hash(pin) } })),
      );
      const commissaryStaff = await tx.user.create({ data: { name: "Ben Commissary", pinHash: hash("5001") } });

      // ── Locations via the same one-step service the "Add branch" form uses ─
      const matina = await createLocation(
        tx,
        {
          name: "Wingboss Matina",
          code: "MAT",
          type: "BRANCH",
          address: "Matina, Davao City",
          openedOn: "",
          drawerFloat: 200000n,
          sortOrder: 10,
          moneyAccounts: ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH"],
          channelIds,
          staff: [
            { userId: admin.id, roleId: roles.admin },
            { userId: cashiers[0].id, roleId: roles.cashier },
            { userId: cashiers[1].id, roleId: roles.cashier },
          ],
        },
        owner.id,
      );
      const lanang = await createLocation(
        tx,
        {
          name: "Wingboss Lanang",
          code: "LAN",
          type: "BRANCH",
          address: "Lanang, Davao City",
          openedOn: "",
          drawerFloat: 200000n,
          sortOrder: 20,
          moneyAccounts: ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH"],
          channelIds,
          staff: [
            { userId: admin.id, roleId: roles.admin },
            { userId: cashiers[2].id, roleId: roles.cashier },
            { userId: cashiers[3].id, roleId: roles.cashier },
          ],
        },
        owner.id,
      );
      const commissary = await createLocation(
        tx,
        {
          name: "Wingboss Commissary",
          code: "COM",
          type: "COMMISSARY",
          address: "Matina, Davao City (same building as Matina branch)",
          openedOn: "",
          drawerFloat: 0n,
          sortOrder: 30,
          moneyAccounts: ["PETTY_CASH"],
          channelIds: [],
          staff: [{ userId: commissaryStaff.id, roleId: roles.commissary }],
        },
        owner.id,
      );
      const office = await createLocation(
        tx,
        {
          name: "Head Office",
          code: "HO",
          type: "OFFICE",
          address: "",
          openedOn: "",
          drawerFloat: 0n,
          sortOrder: 40,
          moneyAccounts: [],
          channelIds: [],
          staff: [],
        },
        owner.id,
      );
      await tx.location.updateMany({ data: { taxEntityId: taxEntity.id } });

      // Expenses at or above ₱5,000 need the "high" approval permission (Owner by default).
      await tx.approvalRule.create({
        data: { module: "expenses", minAmountCents: 500000n, requiredPermission: "expenses:approve:high" },
      });

      // ── Discount types ─────────────────────────────────────────────────
      const discounts = [
        { code: "SC", name: "Senior Citizen (20%)", defaultRateBp: 2000, requiresIdentity: true, key: "DISC_SC_PWD" },
        { code: "PWD", name: "PWD (20%)", defaultRateBp: 2000, requiresIdentity: true, key: "DISC_SC_PWD" },
        { code: "PROMO", name: "Promo", defaultRateBp: null, requiresIdentity: false, key: "DISC_PROMO" },
        { code: "VOUCHER", name: "Voucher", defaultRateBp: null, requiresIdentity: false, key: "DISC_PROMO" },
        { code: "EMP_MEAL", name: "Employee meal", defaultRateBp: null, requiresIdentity: false, key: "DISC_COMPS" },
        { code: "COMP", name: "Comp (free)", defaultRateBp: null, requiresIdentity: false, key: "DISC_COMPS" },
      ];
      for (const d of discounts) {
        await tx.discountType.create({
          data: {
            code: d.code,
            name: d.name,
            defaultRateBp: d.defaultRateBp,
            requiresIdentity: d.requiresIdentity,
            contraAccountId: await accountIdByKey(tx, d.key),
          },
        });
      }

      // ── Inventory items ────────────────────────────────────────────────
      const categoryIds: Record<string, string> = {};
      for (const [i, c] of ITEM_CATEGORIES.entries()) {
        const cat = await tx.itemCategory.create({
          data: { name: c.name, defaultCostClass: c.costClass, sortOrder: i * 10 },
        });
        categoryIds[c.name] = cat.id;
      }
      const branchIds = [matina.id, lanang.id];
      const wingsItemIds: string[] = [];
      for (const it of ITEMS) {
        const cat = ITEM_CATEGORIES.find((c) => c.name === it.category)!;
        const item = await tx.item.create({
          data: {
            sku: it.sku,
            name: it.name,
            categoryId: categoryIds[it.category],
            costClass: cat.costClass,
            baseUnit: it.baseUnit,
            purchaseUnit: it.purchaseUnit ?? null,
            purchaseToBase: it.purchaseToBase ?? 1,
            isProduced: it.isProduced ?? false,
            countFrequency: it.count,
            inventoryAccountId: await accountIdByKey(tx, it.inventoryKey),
            consumptionAccountId: await accountIdByKey(tx, it.consumptionKey),
          },
        });
        if (it.sku === "PRO-WING") wingsItemIds.push(item.id);
        const at = [
          ...(it.stockedAt.includes("BRANCH") ? branchIds : []),
          ...(it.stockedAt.includes("COMMISSARY") ? [commissary.id] : []),
        ];
        for (const [i, locationId] of at.entries()) {
          await tx.itemLocationSetting.create({
            data: { itemId: item.id, locationId, storageArea: it.storageArea, countSortOrder: i },
          });
        }
      }

      // ── Menu: products, ₱0.00 placeholder prices, per-pax standards at 0 ─
      const priceList = await tx.priceList.create({
        data: { name: "Standard prices (SET ME)", effectiveFrom: new Date("2026-01-01T00:00:00Z") },
      });
      for (const [i, p] of PRODUCTS.entries()) {
        const product = await tx.product.create({
          data: {
            name: p.name,
            type: p.type,
            paxPerUnit: p.paxPerUnit,
            revenueAccountId: await accountIdByKey(tx, p.revenueKey),
            sortOrder: i,
          },
        });
        await tx.priceListItem.create({ data: { priceListId: priceList.id, productId: product.id, priceCents: 0n } });
        if (p.type === "PACKAGE") {
          // Standard kg wings per pax starts at 0: the inventory dashboard
          // prompts the Owner to set it (or accept a suggestion from counts).
          await tx.recipe.create({
            data: {
              name: `${p.name} – standard per pax`,
              kind: "PACKAGE_PER_PAX",
              productId: product.id,
              effectiveFrom: new Date("2026-01-01T00:00:00Z"),
              lines: { create: wingsItemIds.map((itemId) => ({ itemId, qty: 0 })) },
            },
          });
        }
      }

      return {
        roles,
        owner,
        admin,
        cashiers,
        commissaryStaff,
        locations: { matina, lanang, commissary, office },
        moneyAccounts: { bpi, gcash1, gcash2, maya, grab },
        channelIds,
      };
    },
    { timeout: 120_000 },
  );
}

export type BaseSeed = Awaited<ReturnType<typeof seedBase>>;
