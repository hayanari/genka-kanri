#!/usr/bin/env node
/**
 * 寺地町東ほか下水管改築工事 の設計書を取り込む
 * 実行: node scripts/import-terajimachi.js
 */
process.argv.push(
  "寺地町東ほか下水管改築工事（７－２１）（詳細設計付）（その２）",
  "寺地町東"
);
require("./import-design-to-project.js");
