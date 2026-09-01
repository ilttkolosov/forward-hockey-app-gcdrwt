import assert from "node:assert/strict";
import {
  formatMessengerPlayerDisplayName,
  replaceMessengerPlayerNumbers,
} from "../features/messenger/playerIdentity.ts";

replaceMessengerPlayerNumbers([
  { id: 76, number: 56 },
  { id: 77, number: null },
  { id: 78, number: 0 },
]);
assert.equal(formatMessengerPlayerDisplayName("Дмитрий Колосов", 76), "Дмитрий Колосов #56");
assert.equal(formatMessengerPlayerDisplayName("Колос", 76), "Колос #56");
assert.equal(formatMessengerPlayerDisplayName("Без ID", null), "Без ID");
assert.equal(formatMessengerPlayerDisplayName("Нет игрока", 999), "Нет игрока");
assert.equal(formatMessengerPlayerDisplayName("Без номера", 77), "Без номера");
assert.equal(formatMessengerPlayerDisplayName("Нулевой", 78), "Нулевой #0");
assert.equal(formatMessengerPlayerDisplayName("Дмитрий Колосов #56", 76), "Дмитрий Колосов #56");

replaceMessengerPlayerNumbers([{ id: 76, number: 57 }]);
assert.equal(formatMessengerPlayerDisplayName("Дмитрий Колосов", "76"), "Дмитрий Колосов #57");

replaceMessengerPlayerNumbers([]);
assert.equal(formatMessengerPlayerDisplayName("Дмитрий Колосов", 76), "Дмитрий Колосов");

console.log("Messenger player identity checks passed.");
