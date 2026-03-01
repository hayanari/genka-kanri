#!/usr/bin/env node
/**
 * 車之町東ほか下水管耐震化工事 の設計書を取り込む
 * 実行: node scripts/import-kurumachi.js
 */
process.argv.push("車之町東ほか下水管耐震化工事（７－２１）", "車之町東");
require("./import-design-to-project.js");
