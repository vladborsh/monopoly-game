import type { Tile } from "../core/board";

/**
 * Best-effort transcription of the photographed "Монополія UA Люкс" board.
 * A handful of entries were hard to read clearly in the photo and are
 * marked `// verify:` — cross-check these against the physical board.
 */
export const BOARD_TILES: Tile[] = [
  { type: "go", id: 0, name: "Вперед" },

  // --- right column, top to bottom ---
  { type: "property", id: 1, name: "Будапешт", price: 60_000, colorGroup: "gold", baseRent: 4_000, monopolyMultiplier: 2 },
  { type: "chance", id: 2, name: "Шанс" },
  { type: "property", id: 3, name: "Варшава", price: 80_000, colorGroup: "gold", baseRent: 6_000, monopolyMultiplier: 2 },
  { type: "treasury", id: 4, name: "Казна" },
  { type: "company", id: 5, name: "Авіакомпанія", price: 200_000, kind: "airline" },
  { type: "property", id: 6, name: "Прага", price: 100_000, colorGroup: "blue", baseRent: 8_000, monopolyMultiplier: 2 },
  { type: "tax", id: 7, name: "Додатковий податок", amount: 100_000 },
  { type: "property", id: 8, name: "Кейптаун", price: 100_000, colorGroup: "blue", baseRent: 8_000, monopolyMultiplier: 2 },
  { type: "property", id: 9, name: "Монреаль", price: 120_000, colorGroup: "blue", baseRent: 10_000, monopolyMultiplier: 2 },

  { type: "jail", id: 10, name: "В'язниця" },

  // --- bottom row, right to left ---
  { type: "property", id: 11, name: "Сеул", price: 140_000, colorGroup: "orange", baseRent: 12_000, monopolyMultiplier: 2 },
  { type: "chance", id: 12, name: "Шанс" },
  { type: "property", id: 13, name: "Мадрид", price: 140_000, colorGroup: "orange", baseRent: 12_000, monopolyMultiplier: 2 },
  { type: "property", id: 14, name: "Гамбург", price: 160_000, colorGroup: "orange", baseRent: 14_000, monopolyMultiplier: 2 },
  { type: "company", id: 15, name: "Автотранспортна компанія", price: 200_000, kind: "trucking" },
  { type: "property", id: 16, name: "Барселона", price: 180_000, colorGroup: "magenta", baseRent: 16_000, monopolyMultiplier: 2 },
  { type: "treasury", id: 17, name: "Казна" },
  { type: "property", id: 18, name: "Шанхай", price: 180_000, colorGroup: "magenta", baseRent: 16_000, monopolyMultiplier: 2 },
  { type: "property", id: 19, name: "Стокгольм", price: 200_000, colorGroup: "magenta", baseRent: 18_000, monopolyMultiplier: 2 },

  { type: "casino", id: 20, name: "Casino" },

  // --- left column, bottom to top ---
  { type: "property", id: 21, name: "Мельбурн", price: 220_000, colorGroup: "green", baseRent: 20_000, monopolyMultiplier: 2 },
  { type: "company", id: 22, name: "Інтернет компанія", price: 150_000, kind: "internet" },
  { type: "property", id: 23, name: "Мюнхен", price: 220_000, colorGroup: "green", baseRent: 20_000, monopolyMultiplier: 2 },
  { type: "property", id: 24, name: "Осло", price: 240_000, colorGroup: "green", baseRent: 22_000, monopolyMultiplier: 2 },
  { type: "company", id: 25, name: "Судноплавна компанія", price: 200_000, kind: "shipping" },
  { type: "property", id: 26, name: "Копенгаген", price: 260_000, colorGroup: "red", baseRent: 24_000, monopolyMultiplier: 2 },
  { type: "chance", id: 27, name: "Шанс" },
  { type: "property", id: 28, name: "Париж", price: 260_000, colorGroup: "red", baseRent: 24_000, monopolyMultiplier: 2 },
  { type: "property", id: 29, name: "Ванкувер", price: 280_000, colorGroup: "red", baseRent: 26_000, monopolyMultiplier: 2 },

  // base tax amount; engine.ts adds +25_000 per house the landing player owns anywhere on the board
  { type: "tax", id: 30, name: "Податок на нерухомість", amount: 50_000 },

  // --- top row, left to right ---
  { type: "property", id: 31, name: "Женева", price: 300_000, colorGroup: "teal", baseRent: 26_000, monopolyMultiplier: 2 },
  { type: "property", id: 32, name: "Амстердам", price: 300_000, colorGroup: "teal", baseRent: 26_000, monopolyMultiplier: 2 },
  // verify: pink "license" tile — treated as a standalone company (kind picked arbitrarily, revisit)
  { type: "company", id: 33, name: "Ліцензійна компанія", price: 150_000, kind: "internet" },
  { type: "property", id: 34, name: "Лондон", price: 320_000, colorGroup: "teal", baseRent: 28_000, monopolyMultiplier: 2 },
  { type: "company", id: 35, name: "Метро", price: 200_000, kind: "metro" },
  { type: "tax", id: 36, name: "Додатковий податок", amount: 200_000 },
  // verify: side likely has 9 tiles like the others; two slots below were unreadable in the photo and are placeholders
  { type: "property", id: 37, name: "Нью-Йорк", price: 400_000, colorGroup: "purple", baseRent: 35_000, monopolyMultiplier: 2 },
  { type: "treasury", id: 38, name: "Казна" },
  { type: "property", id: 39, name: "Гонконг", price: 350_000, colorGroup: "purple", baseRent: 30_000, monopolyMultiplier: 2 },
];
