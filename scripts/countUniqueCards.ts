import "../src/config.js";
import { prisma } from "../src/db.js";

async function main() {
  const [namesRow] = await prisma.$queryRawUnsafe<[{ count: number }]>(
    "SELECT COUNT(DISTINCT name) as count FROM Card WHERE isCommanderLegal = 1"
  );
  const [printsRow] = await prisma.$queryRawUnsafe<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM Card WHERE isCommanderLegal = 1"
  );
  console.log("Unique names:", Number(namesRow.count));
  console.log("Total prints:", Number(printsRow.count));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
