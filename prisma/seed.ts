import { PrismaClient, ItemRarity } from "@prisma/client"

const prisma = new PrismaClient()

const RUNES = [
  { runeType: "IGNIVAR", name: "Ignivar" },
  { runeType: "CRYSALITH", name: "Crysalith" },
  { runeType: "VOLTARYN", name: "Voltaryn" },
  { runeType: "UMBRYSS", name: "Umbryss" },
  { runeType: "SOLARIS", name: "Solaris" },
  { runeType: "SYLVARIS", name: "Sylvaris" },
] as const

const RARITIES: ItemRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY"]

const BASE_RATE_BY_RARITY: Record<ItemRarity, number> = {
  COMMON: 0.0002 * 1000,      // 0.2
  RARE: 0.0004 * 1000,        // 0.4
  EPIC: 0.0008 * 1000,        // 0.8
  LEGENDARY: 0.0014 * 1000,   // 1.4
}

function rarityLabel(r: ItemRarity) {
  switch (r) {
    case "COMMON": return "Common"
    case "RARE": return "Rare"
    case "EPIC": return "Epic"
    case "LEGENDARY": return "Legendary"
  }
}

async function main() {
  let count = 0

  for (const rune of RUNES) {
    for (const rarity of RARITIES) {
      const name = `${rune.name} - ${rarityLabel(rarity)}`
      await prisma.item.upsert({
        where: { name },
        create: {
          name,
          rarity,
          baseRate: BASE_RATE_BY_RARITY[rarity],
          maxHp: 100,
          runeType: rune.runeType,
        },
        update: {
          rarity,
          baseRate: BASE_RATE_BY_RARITY[rarity],
          maxHp: 100,
          runeType: rune.runeType,
        },
      })
      count++
    }
  }

  console.log(`✅ Seed OK: ${count} runes (6x4) upserted`)
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
