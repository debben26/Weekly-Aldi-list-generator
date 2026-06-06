-- CreateEnum
CREATE TYPE "Dimension" AS ENUM ('volume', 'weight', 'count', 'package');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('weekly', 'restock');

-- CreateEnum
CREATE TYPE "PantryStatus" AS ENUM ('have', 'low', 'out', 'unknown');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('weekly_staple', 'restock', 'pantry_review', 'manual', 'recipe');

-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('draft', 'active', 'completed');

-- CreateEnum
CREATE TYPE "ShoppingListStatus" AS ENUM ('draft', 'active', 'completed');

-- CreateEnum
CREATE TYPE "AldiFitStatus" AS ENUM ('good', 'medium', 'low', 'unknown');

-- CreateEnum
CREATE TYPE "PriceSourceType" AS ENUM ('manual', 'estimated', 'historical_average', 'future_receipt', 'future_api');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'Aldi',
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "StoreSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "food" BOOLEAN NOT NULL DEFAULT true,
    "aldiFriendly" BOOLEAN NOT NULL DEFAULT true,
    "defaultSectionId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "purchaseUnit" TEXT NOT NULL,
    "purchaseUnitSize" DOUBLE PRECISION,
    "purchaseUnitSizeUnit" TEXT,
    "recipeToPurchase" JSONB,
    "dimension" "Dimension",
    "size" TEXT,
    "variant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAlias" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "aliasText" TEXT NOT NULL,

    CONSTRAINT "ItemAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "baseServings" INTEGER NOT NULL DEFAULT 4,
    "prepTime" INTEGER,
    "cookTime" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "aldiFitStatus" "AldiFitStatus" NOT NULL DEFAULT 'unknown',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "ownerUserId" TEXT,
    "createdById" TEXT,
    "sourceRecipeId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "itemId" TEXT,
    "quantity" DOUBLE PRECISION,
    "recipeUnit" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "scalable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanEntry" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "targetServings" INTEGER NOT NULL,
    "mealType" TEXT,

    CONSTRAINT "MealPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StapleRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "defaultQuantity" DOUBLE PRECISION,
    "defaultUnit" TEXT,
    "defaultSectionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "expectedIntervalDays" INTEGER,
    "lastPurchasedDate" DATE,
    "snoozedUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StapleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "PantryStatus" NOT NULL DEFAULT 'unknown',
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "ShoppingListStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "itemId" TEXT,
    "displayName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "sectionId" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "estimatedPrice" DECIMAL(10,2),
    "paidPrice" DECIMAL(10,2),
    "sourceSummary" TEXT,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItemSource" (
    "id" TEXT NOT NULL,
    "shoppingListItemId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "recipeId" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,

    CONSTRAINT "ShoppingListItemSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSnapshot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "shoppingListId" TEXT,
    "weekStart" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "storeName" TEXT NOT NULL,
    "totalEstimated" DECIMAL(10,2),
    "totalPaid" DECIMAL(10,2),
    "itemCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSnapshotItem" (
    "id" TEXT NOT NULL,
    "tripSnapshotId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "sectionName" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "estimatedPrice" DECIMAL(10,2),
    "paidPrice" DECIMAL(10,2),
    "sourceLabels" TEXT[],
    "itemId" TEXT,

    CONSTRAINT "TripSnapshotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantityBasis" TEXT,
    "unitPrice" DECIMAL(10,4),
    "observedDate" DATE NOT NULL,
    "sourceType" "PriceSourceType" NOT NULL DEFAULT 'manual',
    "confidence" TEXT,
    "notes" TEXT,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerProduct" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "externalId" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_userId_householdId_key" ON "HouseholdMember"("userId", "householdId");

-- CreateIndex
CREATE INDEX "StoreSection_storeId_sortOrder_idx" ON "StoreSection"("storeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSection_storeId_name_key" ON "StoreSection"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_canonicalName_key" ON "Item"("canonicalName");

-- CreateIndex
CREATE INDEX "ItemAlias_aliasText_idx" ON "ItemAlias"("aliasText");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAlias_itemId_aliasText_key" ON "ItemAlias"("itemId", "aliasText");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "MealPlanEntry_mealPlanId_idx" ON "MealPlanEntry"("mealPlanId");

-- CreateIndex
CREATE INDEX "StapleRule_householdId_ruleType_idx" ON "StapleRule"("householdId", "ruleType");

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_householdId_itemId_key" ON "PantryItem"("householdId", "itemId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_shoppingListId_idx" ON "ShoppingListItem"("shoppingListId");

-- CreateIndex
CREATE INDEX "ShoppingListItemSource_shoppingListItemId_idx" ON "ShoppingListItemSource"("shoppingListItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TripSnapshot_shoppingListId_key" ON "TripSnapshot"("shoppingListId");

-- CreateIndex
CREATE INDEX "TripSnapshotItem_tripSnapshotId_idx" ON "TripSnapshotItem"("tripSnapshotId");

-- CreateIndex
CREATE INDEX "TripSnapshotItem_itemId_idx" ON "TripSnapshotItem"("itemId");

-- CreateIndex
CREATE INDEX "PriceObservation_itemId_observedDate_idx" ON "PriceObservation"("itemId", "observedDate");

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSection" ADD CONSTRAINT "StoreSection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_defaultSectionId_fkey" FOREIGN KEY ("defaultSectionId") REFERENCES "StoreSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAlias" ADD CONSTRAINT "ItemAlias_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StapleRule" ADD CONSTRAINT "StapleRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StapleRule" ADD CONSTRAINT "StapleRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StapleRule" ADD CONSTRAINT "StapleRule_defaultSectionId_fkey" FOREIGN KEY ("defaultSectionId") REFERENCES "StoreSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "StoreSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItemSource" ADD CONSTRAINT "ShoppingListItemSource_shoppingListItemId_fkey" FOREIGN KEY ("shoppingListItemId") REFERENCES "ShoppingListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSnapshot" ADD CONSTRAINT "TripSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSnapshot" ADD CONSTRAINT "TripSnapshot_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSnapshotItem" ADD CONSTRAINT "TripSnapshotItem_tripSnapshotId_fkey" FOREIGN KEY ("tripSnapshotId") REFERENCES "TripSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerProduct" ADD CONSTRAINT "RetailerProduct_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
