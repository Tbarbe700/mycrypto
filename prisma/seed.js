const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const items = [
    { name: "Casque commun", rarity: "COMMON", baseRate: 0.5, maxHp: 100 },
    { name: "Bottes communes", rarity: "COMMON", baseRate: 0.5, maxHp: 100 },
    { name: "Anneau commun", rarity: "COMMON", baseRate: 0.5, maxHp: 100 },
    { name: "Épée rare", rarity: "RARE", baseRate: 1.0, maxHp: 100 },
    { name: "Amulette rare", rarity: "RARE", baseRate: 1.0, maxHp: 100 },
  ]

  for (const it of items) {
    await prisma.item.upsert({
      where: { name: it.name },
      update: it,
      create: it,
    })
  }

  console.log("✅ Seed items done")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
