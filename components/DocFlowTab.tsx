"use client";

import { useState } from "react";
import { genId, fmtDate, STATUS_MAP, T } from "@/lib/constants";
import type { Project, DocFlowItem, DocFlowStatus } from "@/lib/utils";
import {
  CONTRACT_ROLES,
  CONTRACT_STAGE,
  DOC_FLOW_PHASES,
  DOC_FLOW_STAGES,
  DOC_FLOW_STATUS,
  buildDocFlowTemplate,
  currentDocFlowStage,
  docFlowPhase,
  docFlowProgress,
  isStageComplete,
  overdueItems,
  stageCounts,
  suggestedProjectStatus,
} from "@/lib/docFlow";
import type { ContractRole } from "@/lib/docFlow";
import { jstTodayYmd } from "@/lib/scheduleLabor";
import { Badge, Bar, Btn, Card, Inp, Modal, Sel } from "./ui/primitives";

type EditForm = {
  id: string | null;
  stage: number;
  name: string;
  required: boolean;
  submitTo: string;
  dueDate: string;
  assignee: string;
  note: string;
};

const emptyForm = (stage: number): EditForm => ({
  id: null,
  stage,
  name: "",
  required: true,
  submitTo: "",
  dueDate: "",
  assignee: "",
  note: "",
});

export default function DocFlowTab({
  project: p,
  onUpdateProject,
  readOnly = false,
}: {
  project: Project;
  onUpdateProject: (p: Project) => void;
  readOnly?: boolean;
}) {
  const role = p.contractRole;
  const items = p.docFlow ?? [];
  const [form, setForm] = useState<EditForm | null>(null);
  const [roleChange, setRoleChange] = useState<ContractRole | null>(null);

  const save = (next: DocFlowItem[], nextRole: ContractRole | undefined = role) =>
    onUpdateProject({ ...p, contractRole: nextRole, docFlow: next });

  const chooseRole = (r: ContractRole) => {
    if (r === role) return;
    // 書類がある状態で立場を変えると、テンプレートで置き換えるため確認する
    if (items.length > 0) {
      setRoleChange(r);
      return;
    }
    save(buildDocFlowTemplate(r), r);
  };

  // 提出済・受理になった日を残し、全書類完了日の表示に使う
  const setStatus = (id: string, status: DocFlowStatus) =>
    save(
      items.map((it) => {
        if (it.id !== id) return it;
        const done = status === "submitted" || status === "accepted";
        return { ...it, status, doneAt: done ? it.doneAt ?? jstTodayYmd() : undefined };
      }),
    );

  const submitForm = () => {
    if (!form || !form.name.trim()) return;
    const fields = {
      stage: form.stage,
      name: form.name.trim(),
      required: form.required,
      submitTo: form.submitTo || undefined,
      dueDate: form.dueDate || undefined,
      assignee: form.assignee || undefined,
      note: form.note || undefined,
    };
    if (form.id) {
      save(items.map((it) => (it.id === form.id ? { ...it, ...fields } : it)));
    } else {
      save([...items, { id: genId(), status: "todo", ...fields }]);
    }
    setForm(null);
  };

  const removeItem = (id: string) => {
    save(items.filter((it) => it.id !== id));
    setForm(null);
  };

  const roleSelector = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(Object.keys(CONTRACT_ROLES) as ContractRole[]).map((r) => {
        const m = CONTRACT_ROLES[r];
        const active = role === r;
        return (
          <button
            key={r}
            disabled={readOnly}
            onClick={() => chooseRole(r)}
            style={{
              flex: "1 1 160px",
              padding: "12px",
              borderRadius: 10,
              cursor: readOnly ? "default" : "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              border: `2px solid ${active ? m.color : T.bd}`,
              background: active ? m.color + "12" : T.s2,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: active ? m.color : T.tx }}>{m.label}</div>
            <div style={{ fontSize: 12, color: T.ts, marginTop: 2 }}>{m.desc}</div>
          </button>
        );
      })}
    </div>
  );

  if (!role) {
    return (
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>この案件の立場を選んでください</div>
        <div style={{ fontSize: 12, color: T.ts, marginBottom: 12 }}>
          立場に合わせて、契約・着手・請求までの書類チェックリストを作ります。書類はあとから追加・削除できます。
        </div>
        {roleSelector}
      </Card>
    );
  }

  const stages = DOC_FLOW_STAGES[role];
  const current = currentDocFlowStage(items);
  const phase = docFlowPhase(items);
  const progress = docFlowProgress(items);
  const suggested = readOnly ? null : suggestedProjectStatus(items, p.status);
  const overdue = overdueItems(items, jstTodayYmd());
  const missingNow = items.filter(
    (it) => it.stage === current && it.required && it.status !== "submitted" && it.status !== "accepted",
  );

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        {roleSelector}

        {phase === "complete" && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 10,
              background: T.ok + "15",
              border: `1px solid ${T.ok}55`,
              color: T.ok,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ✓ 全書類完了（5段階すべて完了）
            {progress.completedAt && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600 }}>完了日 {fmtDate(progress.completedAt)}</span>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: T.ts, fontWeight: 600 }}>必須書類の進捗</span>
            <span style={{ color: T.tx, fontWeight: 700 }}>
              {progress.requiredDone} / {progress.requiredTotal} 件（{progress.pct}%）
            </span>
          </div>
          <Bar value={progress.pct} h={8} color={phase === "complete" ? T.ok : T.ac} />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto" }}>
          {stages.map((label, i) => {
            const s = i + 1;
            const done = isStageComplete(items, s);
            const counts = stageCounts(items, s);
            const isCurrent = s === current && !done;
            const isContract = s === CONTRACT_STAGE;
            const color = done ? T.ok : isCurrent ? T.ac : T.ts;
            return (
              <div
                key={s}
                style={{
                  flex: "1 0 96px",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `${isContract ? 2 : 1}px solid ${isCurrent ? T.ac : isContract ? T.ac + "66" : T.bd}`,
                  background: done ? T.ok + "12" : isCurrent ? T.al : T.s,
                }}
              >
                <div style={{ fontSize: 11, color, fontWeight: 600 }}>
                  {done ? "✓ " : ""}段階{s}
                  {isContract ? "・確定点" : ""}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>{label}</div>
                <div style={{ fontSize: 11, color, marginTop: 2 }}>
                  {counts.total > 0 ? `${counts.done}/${counts.total} 件` : "必須なし"}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, fontSize: 12 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontWeight: 600,
              color: DOC_FLOW_PHASES[phase].color,
              background: DOC_FLOW_PHASES[phase].color + "15",
            }}
          >
            {DOC_FLOW_PHASES[phase].label}
          </span>
          {progress.awaitingAcceptance > 0 && (
            <span style={{ padding: "4px 10px", borderRadius: 6, color: T.wn, background: T.wn + "15" }}>
              受理待ち {progress.awaitingAcceptance}件
            </span>
          )}
          {phase !== "complete" && missingNow.length > 0 && (
            <span style={{ padding: "4px 10px", borderRadius: 6, color: T.ac, background: T.al }}>
              次に出す書類：{missingNow.map((it) => it.name).join("、")}
            </span>
          )}
          {overdue.length > 0 && (
            <span style={{ padding: "4px 10px", borderRadius: 6, color: T.dg, background: T.dg + "12", fontWeight: 600 }}>
              期限切れ {overdue.length}件
            </span>
          )}
        </div>

        {suggested && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: T.s2,
              fontSize: 12,
              color: T.ts,
            }}
          >
            <span>
              {phase === "complete" ? "全書類が揃いました。" : "契約が確定しました。"}
              案件ステータスは今「{STATUS_MAP[p.status]?.label ?? p.status}」です。
            </span>
            <Btn sm v="primary" onClick={() => onUpdateProject({ ...p, status: suggested })}>
              「{STATUS_MAP[suggested].label}」にする
            </Btn>
          </div>
        )}
      </Card>

      {stages.map((label, i) => {
        const s = i + 1;
        const stageItems = items.filter((it) => it.stage === s);
        return (
          <Card key={s} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                段階{s}　{label}
                {isStageComplete(items, s) && stageItems.length > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: T.ok }}>✓ 完了</span>
                )}
              </div>
              {!readOnly && (
                <Btn sm v="ghost" onClick={() => setForm(emptyForm(s))}>
                  ＋ 書類を追加
                </Btn>
              )}
            </div>
            {stageItems.length === 0 && <div style={{ fontSize: 12, color: T.ts }}>書類なし</div>}
            {stageItems.map((it) => {
              const late = overdue.some((o) => o.id === it.id);
              return (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    padding: "8px 0",
                    borderTop: `1px solid ${T.bd}`,
                  }}
                >
                  <div
                    style={{ flex: "1 1 200px", minWidth: 0, cursor: readOnly ? "default" : "pointer" }}
                    onClick={() =>
                      !readOnly &&
                      setForm({
                        id: it.id,
                        stage: it.stage,
                        name: it.name,
                        required: it.required,
                        submitTo: it.submitTo ?? "",
                        dueDate: it.dueDate ?? "",
                        assignee: it.assignee ?? "",
                        note: it.note ?? "",
                      })
                    }
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                      {it.name}
                      {!it.required && <span style={{ marginLeft: 6, fontSize: 11, color: T.ts }}>（任意）</span>}
                    </div>
                    <div style={{ fontSize: 11, color: late ? T.dg : T.ts }}>
                      {it.submitTo && it.submitTo !== "—" ? `提出先: ${it.submitTo}　` : ""}
                      {it.dueDate ? `期限: ${fmtDate(it.dueDate)}${late ? "（期限切れ）" : ""}　` : ""}
                      {it.assignee ? `担当: ${it.assignee}` : ""}
                    </div>
                  </div>
                  {readOnly ? (
                    <Badge status={it.status} map={DOC_FLOW_STATUS} />
                  ) : (
                    <Sel
                      value={it.status}
                      onChange={(e) => setStatus(it.id, e.target.value as DocFlowStatus)}
                      style={{
                        padding: "6px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: DOC_FLOW_STATUS[it.status].color,
                        background: DOC_FLOW_STATUS[it.status].bg,
                      }}
                    >
                      {(Object.keys(DOC_FLOW_STATUS) as DocFlowStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {DOC_FLOW_STATUS[st].label}
                        </option>
                      ))}
                    </Sel>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}

      <div style={{ fontSize: 11, color: T.ts, marginTop: 4 }}>
        書類名は社内で使っている標準的な書類です。発注者・元請ごとに必要な書類に合わせて追加・削除してください。
      </div>

      {form && (
        <Modal title={form.id ? "書類を編集" : "書類を追加"} onClose={() => setForm(null)}>
          <div style={{ display: "grid", gap: 12 }}>
            <Inp label="書類名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Sel label="段階" value={form.stage} onChange={(e) => setForm({ ...form, stage: Number(e.target.value) })}>
              {stages.map((label, i) => (
                <option key={i} value={i + 1}>
                  段階{i + 1}　{label}
                </option>
              ))}
            </Sel>
            <Inp label="提出先" value={form.submitTo} onChange={(e) => setForm({ ...form, submitTo: e.target.value })} />
            <Inp label="提出期限" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Inp label="担当者" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} />
            <Inp label="メモ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
              />
              必須（段階の完了判定に使う）
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              {form.id ? (
                <Btn v="danger" sm onClick={() => removeItem(form.id!)}>
                  削除
                </Btn>
              ) : (
                <span />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => setForm(null)}>キャンセル</Btn>
                <Btn v="primary" onClick={submitForm} disabled={!form.name.trim()}>
                  保存
                </Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {roleChange && (
        <Modal title="立場を変更" onClose={() => setRoleChange(null)}>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            「{CONTRACT_ROLES[roleChange].label}」に変更すると、今の書類リスト（{items.length}件・入力済みの状態も含む）を
            {CONTRACT_ROLES[roleChange].label}用のテンプレートで置き換えます。よろしいですか？
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setRoleChange(null)}>キャンセル</Btn>
            <Btn
              v="warning"
              onClick={() => {
                save(buildDocFlowTemplate(roleChange), roleChange);
                setRoleChange(null);
              }}
            >
              置き換える
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
