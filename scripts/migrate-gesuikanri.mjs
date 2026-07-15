/**
 * 下水管理興業（gesuikanri）の旧 Supabase → 本番（app genka kanri）へデータ移行
 *
 * 使い方:
 * 1. 本番 SQL で supabase/add_company_gesuikanri.sql を実行
 * 2. プロジェクト直下に .env.migrate.local を作成（Git にコミットしない）
 * 3. node scripts/migrate-gesuikanri.mjs
 *
 * .env.migrate.local 例:
 * SOURCE_SUPABASE_URL=https://xxxx.supabase.co
 * SOURCE_SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * TARGET_SUPABASE_URL=https://yyyy.supabase.co
 * TARGET_SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * MIGRATE_DEFAULT_PASSWORD=ChangeMe-Gesui-2026
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const GESUI_COMPANY_ID = "00000000-0000-0000-0000-000000000002";
const GESUI_COMPANY_CODE = "gesuikanri";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.migrate.local"));

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`環境変数 ${name} がありません。.env.migrate.local を確認してください。`);
    process.exit(1);
  }
  return v;
}

const source = createClient(
  requireEnv("SOURCE_SUPABASE_URL"),
  requireEnv("SOURCE_SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const target = createClient(
  requireEnv("TARGET_SUPABASE_URL"),
  requireEnv("TARGET_SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const defaultPassword = process.env.MIGRATE_DEFAULT_PASSWORD || "ChangeMe-Gesui-2026";

async function fetchAll(client, table, select = "*") {
  const { data, error } = await client.from(table).select(select);
  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|relation|schema cache/i.test(error.message)
    ) {
      console.warn(`  skip ${table}: テーブルなし (${error.message})`);
      return [];
    }
    throw new Error(`${table}: ${error.message}`);
  }
  return data ?? [];
}

function stripCompanyId(row) {
  const { company_id, ...rest } = row;
  return rest;
}

async function migrateGenkaData() {
  console.log("\n[1] genka_kanri_data");
  const { data, error } = await source
    .from("genka_kanri_data")
    .select("id, data, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const preferred =
    (data ?? []).find((r) => r.id === "default") ||
    (data ?? []).find((r) => r.id === GESUI_COMPANY_ID) ||
    (data ?? [])[0];

  if (!preferred) {
    console.warn("  ソースに genka_kanri_data がありません。空のままにします。");
    return;
  }

  const { error: upErr } = await target.from("genka_kanri_data").upsert(
    {
      id: GESUI_COMPANY_ID,
      data: preferred.data ?? {},
      updated_at: preferred.updated_at ?? new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (upErr) throw upErr;
  console.log(`  copied from id=${preferred.id}`);
}

async function replaceCompanyTable(table, mapRow, options = {}) {
  const { idField = null } = options;
  console.log(`\n[${table}]`);
  const rows = await fetchAll(source, table);
  console.log(`  source rows: ${rows.length}`);

  const { error: delErr } = await target.from(table).delete().eq("company_id", GESUI_COMPANY_ID);
  if (delErr && !/column|company_id/i.test(delErr.message)) {
    console.warn(`  delete warning: ${delErr.message}`);
  }

  if (rows.length === 0) return;

  const payload = [];
  for (const raw of rows) {
    const r = stripCompanyId(raw);
    let mapped = mapRow(r);

    // 他社と id が衝突する場合はプレフィックスを付ける（PK が id のみのテーブル用）
    if (idField && mapped[idField]) {
      const { data: existing } = await target
        .from(table)
        .select(`${idField}, company_id`)
        .eq(idField, mapped[idField])
        .maybeSingle();
      if (existing && existing.company_id && existing.company_id !== GESUI_COMPANY_ID) {
        mapped = {
          ...mapped,
          [idField]: `gesui_${mapped[idField]}`,
        };
      }
    }
    payload.push(mapped);
  }

  const chunkSize = 100;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await target.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  }
  console.log(`  inserted ${payload.length}`);
}

async function migrateUsers() {
  console.log("\n[auth + company_users]");
  const created = [];

  // ターゲット既存ユーザーを一度取得
  const targetEmailMap = new Map();
  {
    let page = 1;
    for (;;) {
      const { data, error } = await target.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) {
        if (u.email) targetEmailMap.set(u.email.toLowerCase(), u);
      }
      if (users.length < 100) break;
      page += 1;
    }
  }

  let page = 1;
  for (;;) {
    const { data, error } = await source.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const u of users) {
      const email = (u.email || "").toLowerCase();
      if (!email) continue;

      let targetUser = targetEmailMap.get(email);

      if (targetUser) {
        const { data: existingLink } = await target
          .from("company_users")
          .select("company_id")
          .eq("user_id", targetUser.id)
          .maybeSingle();
        if (existingLink?.company_id && existingLink.company_id !== GESUI_COMPANY_ID) {
          console.log(`  skip (他社に所属済): ${email}`);
          continue;
        }
      }

      if (!targetUser) {
        const { data: createdUser, error: cErr } = await target.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            ...(u.user_metadata || {}),
            company_code: GESUI_COMPANY_CODE,
            migrated_from: "gesuikanri-supabase",
          },
        });
        if (cErr) {
          console.warn(`  create failed ${email}: ${cErr.message}`);
          continue;
        }
        targetUser = createdUser.user;
        targetEmailMap.set(email, targetUser);
        created.push(email);
      }

      const loginId = email;
      const { error: linkErr } = await target.from("company_users").upsert(
        {
          company_id: GESUI_COMPANY_ID,
          user_id: targetUser.id,
          login_id: loginId,
          auth_email: email,
          display_name: u.user_metadata?.name || email.split("@")[0],
        },
        { onConflict: "user_id" }
      );
      if (linkErr) {
        console.warn(`  link failed ${email}: ${linkErr.message}`);
      } else {
        console.log(`  linked ${email}`);
      }
    }

    if (users.length < 100) break;
    page += 1;
  }

  if (created.length > 0) {
    console.log("\n新規作成ユーザー（初期パスワード共通）:");
    console.log(`  password: ${defaultPassword}`);
    created.forEach((e) => console.log(`  - ${e}`));
    console.log("  ※ 初回ログイン後にパスワード変更を推奨");
  }
}

async function migrateUserRoles() {
  console.log("\n[user_roles]");
  const rows = await fetchAll(source, "user_roles");
  if (rows.length === 0) return;
  const { error } = await target.from("user_roles").upsert(rows, { onConflict: "email" });
  if (error) console.warn(`  ${error.message}`);
  else console.log(`  upserted ${rows.length}`);
}

async function main() {
  console.log("移行先会社:", GESUI_COMPANY_CODE, GESUI_COMPANY_ID);

  const { data: company, error: cErr } = await target
    .from("companies")
    .select("id, company_code, name")
    .eq("company_code", GESUI_COMPANY_CODE)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!company) {
    console.error(
      "ターゲットに会社 gesuikanri がありません。先に supabase/add_company_gesuikanri.sql を実行してください。"
    );
    process.exit(1);
  }
  console.log("会社OK:", company.name);

  await migrateGenkaData();

  await replaceCompanyTable(
    "schedule_entries",
    (r) => ({
      ...r,
      company_id: GESUI_COMPANY_ID,
    }),
    { idField: "id" }
  );
  await replaceCompanyTable("schedule_workers", (r) => ({
    name: r.name,
    sort_order: r.sort_order ?? 0,
    company_id: GESUI_COMPANY_ID,
  }));
  await replaceCompanyTable("schedule_day_memos", (r) => ({
    date: r.date,
    memo: r.memo ?? "",
    company_id: GESUI_COMPANY_ID,
    updated_at: r.updated_at ?? new Date().toISOString(),
  }));
  await replaceCompanyTable("worker_contacts", (r) => ({
    worker_name: r.worker_name,
    email: r.email ?? "",
    company_id: GESUI_COMPANY_ID,
    updated_at: r.updated_at ?? new Date().toISOString(),
  }));
  await replaceCompanyTable(
    "process_meeting_rows",
    (r) => ({
      ...r,
      company_id: GESUI_COMPANY_ID,
    }),
    { idField: "id" }
  );
  await replaceCompanyTable("process_meeting_project_notes", (r) => ({
    project_id: r.project_id,
    week_start: r.week_start,
    note_text: r.note_text ?? "",
    company_id: GESUI_COMPANY_ID,
    updated_at: r.updated_at ?? new Date().toISOString(),
  }));

  // meta
  {
    console.log("\n[process_meeting_meta]");
    const { data } = await source
      .from("process_meeting_meta")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    const hidden = data?.hidden_project_ids ?? [];
    await target.from("process_meeting_meta").upsert({
      id: GESUI_COMPANY_ID,
      hidden_project_ids: hidden,
      updated_at: new Date().toISOString(),
    });
  }

  await replaceCompanyTable("audit_logs", (r) => ({
    id: r.id,
    created_at: r.created_at,
    user_email: r.user_email ?? "",
    action: r.action ?? "",
    detail: r.detail ?? "",
    company_id: GESUI_COMPANY_ID,
  }));

  await migrateUserRoles();
  await migrateUsers();

  console.log("\n完了。ログイン例:");
  console.log("  会社ID: gesuikanri");
  console.log("  ログインID: （従来のメールアドレス）");
  console.log("  パスワード: 既存ユーザーは旧パスワード / 新規作成は MIGRATE_DEFAULT_PASSWORD");
}

main().catch((e) => {
  console.error("\n移行失敗:", e);
  process.exit(1);
});
