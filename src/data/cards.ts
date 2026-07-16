import type { Card } from "../core/cards";

export const CHANCE_CARDS: Card[] = [
  { id: "chance-go", deck: "chance", text: "Перейдіть на поле «Вперед». Отримайте зарплату.", effect: { kind: "move_to", tileId: 0, grantSalaryIfPassGo: true } },
  { id: "chance-jail", deck: "chance", text: "Відправляйтесь у в'язницю.", effect: { kind: "go_to_jail" } },
  { id: "chance-jailcard", deck: "chance", text: "Картка звільнення з в'язниці. Зберігайте до використання.", effect: { kind: "get_out_of_jail_free" } },
  { id: "chance-fine", deck: "chance", text: "Заплатіть штраф 50 000.", effect: { kind: "pay_bank", amount: 50_000 } },
  { id: "chance-dividend", deck: "chance", text: "Банк виплачує вам дивіденди 100 000.", effect: { kind: "receive_bank", amount: 100_000 } },
  { id: "chance-repairs", deck: "chance", text: "Заплатіть кожному гравцю 30 000.", effect: { kind: "pay_each_player", amount: 30_000 } },
  { id: "chance-birthday", deck: "chance", text: "У вас день народження! Кожен гравець платить вам 20 000.", effect: { kind: "receive_each_player", amount: 20_000 } },
  { id: "chance-forward3", deck: "chance", text: "Просуньтесь вперед на 3 клітинки.", effect: { kind: "move_relative", steps: 3 } },
  { id: "chance-bonus", deck: "chance", text: "Ви отримали бонус від банку. Отримайте 70 000.", effect: { kind: "receive_bank", amount: 70_000 } },
  { id: "chance-investment", deck: "chance", text: "Ваші інвестиції принесли прибуток. Отримайте 60 000.", effect: { kind: "receive_bank", amount: 60_000 } },
  { id: "chance-holiday", deck: "chance", text: "Свято! Кожен гравець дарує вам 15 000.", effect: { kind: "receive_each_player", amount: 15_000 } },
];

export const TREASURY_CARDS: Card[] = [
  { id: "treasury-go", deck: "treasury", text: "Перейдіть на поле «Вперед». Отримайте зарплату.", effect: { kind: "move_to", tileId: 0, grantSalaryIfPassGo: true } },
  { id: "treasury-jail", deck: "treasury", text: "Відправляйтесь у в'язницю.", effect: { kind: "go_to_jail" } },
  { id: "treasury-jailcard", deck: "treasury", text: "Картка звільнення з в'язниці. Зберігайте до використання.", effect: { kind: "get_out_of_jail_free" } },
  { id: "treasury-tax-refund", deck: "treasury", text: "Повернення податку. Отримайте 20 000.", effect: { kind: "receive_bank", amount: 20_000 } },
  { id: "treasury-fine", deck: "treasury", text: "Заплатіть лікарняний рахунок 40 000.", effect: { kind: "pay_bank", amount: 40_000 } },
  { id: "treasury-lottery", deck: "treasury", text: "Ви виграли в лотерею! Отримайте 100 000.", effect: { kind: "receive_bank", amount: 100_000 } },
  { id: "treasury-tax-pay", deck: "treasury", text: "Заплатіть податок на майно 50 000.", effect: { kind: "pay_bank", amount: 50_000 } },
  { id: "treasury-gift", deck: "treasury", text: "Отримайте подарунок 50 000 від кожного гравця.", effect: { kind: "receive_each_player", amount: 50_000 } },
];
