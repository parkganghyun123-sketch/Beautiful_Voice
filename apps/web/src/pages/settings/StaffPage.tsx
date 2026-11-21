// 담당자(W13, BEA-167): 이름. 추가·이름 고치기·숨기기·다시 보이기. 담당자는 로그인하지 않는 예약 자원이고 원장도 담당자가 될 수 있다(명세 1 §2.5).
// 담당자는 지우지 않고 숨긴다 — 지난 예약이 가리킨다(계약 StaffPatch.active). 숨기기는 되돌릴 수 있어 다시 묻지 않는다(디자인 정책).
// 추가·고치기는 폰에서 아래 시트, 노트북에서 가운데 창(메뉴 화면과 같은 틀).
import type { Staff } from '@bv/contracts';
import { ActionButton, ResponsiveDialog } from '@seed-design/react';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/states/DataState';
import { useSettingsApi, VersionConflictError } from '@/features/settings/api';
import { LAST_STAFF_TEXT } from '@/features/settings/messages';
import { canHideStaff } from '@/features/settings/rules';
import { useSaveAction } from '@/features/settings/useSaveAction';
import { useLoad } from '@/lib/useLoad';

/** W13 화면 설계서 문구. */
export const STAFF_HELP_TEXT = '원장님도 담당자로 넣을 수 있어요';
export const STAFF_CONFLICT_TEXT = '다른 곳에서 먼저 고쳤어요. 새 내용을 불러왔으니 확인하고 다시 저장해 주세요.';

type Editing = { kind: 'new' } | { kind: 'edit'; id: string };
const sameEditing = (a: Editing | null, b: Editing) =>
  a !== null && a.kind === b.kind && (a.kind === 'new' || (b.kind === 'edit' && a.id === b.id));

export function StaffPage() {
  const api = useSettingsApi();
  const load = useCallback(() => api.listStaff({ includeInactive: true }), [api]);
  const { state, reload } = useLoad(load);
  // 시트는 목록 바깥에 둔다 — 목록을 다시 불러와도 시트의 입력·재시도 키가 사라지지 않게(#59·#61 리뷰와 같은 틀).
  const [editing, setEditing] = useState<Editing | null>(null);
  const [conflict, setConflict] = useState(false);
  // 열 때마다 시트를 새로 만든다. 결과를 모르는 저장 뒤 같은 대상으로 다시 열 때만 입력·키를 남긴다(#61 리뷰).
  const [session, setSession] = useState(0);
  const unknownResult = useRef<Editing | null>(null);
  const staff = state.status === 'ok' ? state.data : null;
  const target = editing?.kind === 'edit' ? staff?.find((s) => s.id === editing.id) : undefined;
  const sheetOpen = editing !== null && (editing.kind === 'new' || target !== undefined);

  const openSheet = (next: Editing) => {
    if (!sameEditing(unknownResult.current, next)) setSession((n) => n + 1);
    unknownResult.current = null;
    setConflict(false);
    setEditing(next);
  };
  const closeSheet = (resultUnknown: boolean) => {
    unknownResult.current = resultUnknown ? editing : null;
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:max-w-lg">
      <Link to="/settings" className="text-sm text-ink-soft">
        ‹ 설정
      </Link>
      <h1 className="text-xl font-semibold text-ink">담당자</h1>
      {state.status === 'loading' && <p className="py-8 text-center text-sm text-ink-soft">불러오는 중…</p>}
      {state.status === 'error' && <ErrorState onRetry={reload} />}
      {staff && <StaffList staff={staff} reload={reload} onAdd={() => openSheet({ kind: 'new' })} onEdit={(id) => openSheet({ kind: 'edit', id })} />}
      <StaffSheet
        key={`${target ? `${target.id}:${target.version}` : 'new'}:${session}`}
        open={sheetOpen}
        target={target}
        canHide={target !== undefined && staff !== null && canHideStaff(staff, target.id)}
        conflict={conflict}
        onConflict={() => setConflict(true)}
        onClose={closeSheet}
        reload={reload}
      />
    </div>
  );
}

function StaffList({ staff, reload, onAdd, onEdit }: { staff: Staff[]; reload: () => void; onAdd: () => void; onEdit: (id: string) => void }) {
  const api = useSettingsApi();
  const show = useSaveAction(reload);
  const [showing, setShowing] = useState('');
  const active = staff.filter((s) => s.active);
  const hidden = staff.filter((s) => !s.active);

  async function showAgain(s: Staff) {
    show.clear(); // 다른 담당자일 수 있다 — 새 키로.
    setShowing(s.name);
    const done = await show.run((idempotencyKey) => api.updateStaff(s.id, { version: s.version, active: true }, { idempotencyKey }));
    if (done) reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionButton variant="neutralWeak" onClick={onAdd}>
        담당자 추가
      </ActionButton>
      {show.problem && 'message' in show.problem && (
        <p role="alert" className="text-sm text-critical-text">
          {showing}: {show.problem.message}
        </p>
      )}

      {active.length === 0 ? (
        <EmptyState title="등록한 담당자가 없어요" description="예약에는 담당자가 꼭 필요해요. 담당자를 추가해 주세요." />
      ) : (
        <ul aria-label="담당자 목록" className="flex flex-col divide-y divide-line">
          {active.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onEdit(s.id)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                <span className="text-base text-ink">{s.name}</span>
                <span aria-hidden className="text-ink-soft">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <details className="text-ink">
          <summary className="cursor-pointer py-2 text-sm text-ink-soft">숨긴 담당자 {hidden.length}명</summary>
          <ul aria-label="숨긴 담당자" className="flex flex-col divide-y divide-line">
            {hidden.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="text-base text-ink-soft">{s.name}</span>
                <ActionButton variant="ghost" size="small" disabled={show.saving} onClick={() => showAgain(s)} aria-label={`${s.name} 다시 보이기`}>
                  다시 보이기
                </ActionButton>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StaffSheet({
  open,
  target,
  canHide,
  conflict,
  onConflict,
  onClose,
  reload,
}: {
  open: boolean;
  target: Staff | undefined;
  /** 마지막 담당자는 숨길 수 없다(rules.canHideStaff, 화면 쪽 안전장치). */
  canHide: boolean;
  conflict: boolean;
  onConflict: () => void;
  /** resultUnknown: 결과를 모르는 저장(응답 끊김) 뒤에 닫았는가. */
  onClose: (resultUnknown: boolean) => void;
  reload: () => void;
}) {
  const api = useSettingsApi();
  const save = useSaveAction(reload);
  const [name, setName] = useState(target?.name ?? '');
  const nameError = save.problem?.kind === 'fields' ? save.problem.fields.name : undefined;
  // 충돌 안내는 위(STAFF_CONFLICT_TEXT)에서 따로 보인다.
  const message = save.problem && 'message' in save.problem && save.problem.kind !== 'conflict' ? save.problem.message : undefined;

  async function finish(write: (key: string) => Promise<Staff>) {
    const done = await save.run(async (key) => {
      try {
        return await write(key);
      } catch (err) {
        if (err instanceof VersionConflictError) onConflict();
        throw err;
      }
    });
    if (done) {
      onClose(false);
      reload();
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void finish((idempotencyKey) =>
      target ? api.updateStaff(target.id, { name, version: target.version }, { idempotencyKey }) : api.addStaff({ name }, { idempotencyKey }),
    );
  }

  function hide() {
    if (!target || !canHide) return;
    save.clear(); // 저장과 다른 일 — 새 키로.
    void finish((idempotencyKey) => api.updateStaff(target.id, { version: target.version, active: false }, { idempotencyKey }));
  }

  function close(next: boolean) {
    if (next) return;
    const unknown = save.problem?.kind === 'failed';
    onClose(unknown);
    if (unknown) reload();
  }

  return (
    <ResponsiveDialog.Root open={open} onOpenChange={close}>
      <ResponsiveDialog.Positioner>
        <ResponsiveDialog.Backdrop />
        <ResponsiveDialog.Content>
          <ResponsiveDialog.Header>
            <ResponsiveDialog.Title>{target ? '담당자 고치기' : '담당자 추가'}</ResponsiveDialog.Title>
          </ResponsiveDialog.Header>
          <form id="staff-form" noValidate onSubmit={submit}>
            <ResponsiveDialog.Body>
              <fieldset disabled={save.saving} className="flex flex-col gap-4 pb-2">
                {conflict && (
                  <p role="alert" className="text-sm text-critical-text">
                    {STAFF_CONFLICT_TEXT}
                  </p>
                )}
                {/* 안내·오류는 label 밖에 두고 aria-describedby로 잇는다 — 칸 이름은 "이름"만(#65 리뷰). */}
                <div className="flex flex-col gap-1 text-sm">
                  <label htmlFor="staff-name" className="font-medium text-ink">
                    이름
                  </label>
                  <input
                    id="staff-name"
                    aria-describedby={[nameError ? 'staff-name-error' : '', target ? '' : 'staff-name-help'].filter(Boolean).join(' ') || undefined}
                    aria-invalid={nameError ? true : undefined}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      save.clear();
                    }}
                    placeholder="예: 원장"
                    autoComplete="off"
                    className="min-h-10 w-full rounded-md border border-control-line bg-surface px-3 text-base text-ink"
                  />
                  {nameError && (
                    <p id="staff-name-error" className="text-critical-text">
                      {nameError}
                    </p>
                  )}
                  {/* W13 디자인 문구. 담당자를 넣는 자리에 한 번만 보인다(#65 리뷰). */}
                  {!target && (
                    <p id="staff-name-help" className="text-ink-soft">
                      {STAFF_HELP_TEXT}
                    </p>
                  )}
                </div>
                {message && (
                  <p role="alert" className="text-sm text-critical-text">
                    {message}
                  </p>
                )}
              </fieldset>
            </ResponsiveDialog.Body>
          </form>
          <ResponsiveDialog.Footer>
            <div className="flex w-full flex-col gap-2">
              <ActionButton type="submit" form="staff-form" variant="brandSolid" size="large" loading={save.saving} className="w-full">
                저장
              </ActionButton>
              {target && (
                <>
                  <ActionButton variant="ghost" disabled={save.saving || !canHide} onClick={hide} className="w-full">
                    담당자 숨기기
                  </ActionButton>
                  {!canHide && <p className="text-center text-sm text-ink-soft">{LAST_STAFF_TEXT}</p>}
                </>
              )}
            </div>
          </ResponsiveDialog.Footer>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Positioner>
    </ResponsiveDialog.Root>
  );
}
