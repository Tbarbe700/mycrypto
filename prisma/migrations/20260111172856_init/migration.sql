-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "balance" REAL NOT NULL DEFAULT 0,
    "pendingBalance" REAL NOT NULL DEFAULT 0,
    "character" TEXT,
    "characterUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "solanaWallet" TEXT,
    "unlockSignature" TEXT,
    "unlockedAt" DATETIME,
    "lastClaimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDecayAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "baseRate" REAL NOT NULL,
    "maxHp" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlayerItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "pendingEarned" REAL NOT NULL DEFAULT 0,
    "lastItemDecayAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decayCarrySec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseTx" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signature" TEXT NOT NULL,
    "payerWallet" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "chest" TEXT,
    "amountMac" REAL NOT NULL,
    "mint" TEXT,
    "amountRaw" TEXT NOT NULL,
    "amountUi" REAL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseTx_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_name_key" ON "Item"("name");

-- CreateIndex
CREATE INDEX "Item_rarity_idx" ON "Item"("rarity");

-- CreateIndex
CREATE INDEX "PlayerItem_playerId_equipped_idx" ON "PlayerItem"("playerId", "equipped");

-- CreateIndex
CREATE INDEX "PlayerItem_itemId_idx" ON "PlayerItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseTx_signature_key" ON "PurchaseTx"("signature");

-- CreateIndex
CREATE INDEX "PurchaseTx_userId_kind_idx" ON "PurchaseTx"("userId", "kind");

-- CreateIndex
CREATE INDEX "PurchaseTx_payerWallet_idx" ON "PurchaseTx"("payerWallet");

-- CreateIndex
CREATE INDEX "PurchaseTx_createdAt_idx" ON "PurchaseTx"("createdAt");
