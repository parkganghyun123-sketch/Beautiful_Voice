// 메뉴(W13, BEA-167): 이름·기본 관리 시간·기본 준비 시간. 추가·고치기·숨기기·다시 보이기.
// 메뉴는 지우지 않고 숨긴다 — 지난 예약이 가리킨다(계약 MenuPatch.active). 숨기기는 되돌릴 수 있어 다시 묻지 않는다(디자인 정책).
// 추가·고치기는 폰에서 아래 시트, 노트북에서 가운데 창(SEED ResponsiveDialog, 해나 11/21 결정).
import type { Menu } from '@bv/contracts';
import type { ResourceField } from '@bv/scheduling/shop-settings';
import { ActionButton, Chip, ResponsiveDialog } from '@seed-design/react';
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/states/DataState';
import { useSettingsApi, VersionConflictError } from '@/features/settings/api';
import { DURATION_CHIPS, menuTimeText, minutesText, parseMinutes, PREP_CHIPS } from '@/features/settings/menus';
import { PREP_HELP_TEXT } from '@/features/settings/messages';
import { useSaveAction } from '@/features/settings/useSaveAction';
import { useLoad } from '@/lib/useLoad';

/** 시트가 열린 상태: 새 메뉴 추가, 또는 이 메뉴 고치기. */
type Editing = { kind: 'new' } | { kind: 'edit'; id: string };

export function MenusPage() {
  const api = useSettingsApi();
  const load = useCallback(() => api.listMenus({ includeInactive: true }), [api]);
  const { state, reload } = useLoad(load);
  // 시트는 목록 바깥에 둔다 — 목록을 다시 불러와도 시트의 입력·재시도 키가 사라지지 않게(#59 리뷰와 같은 이유).
  const [editing, setEditing] = useState<Editing | null>(null);
  // 다른 곳에서 먼저 고쳐 다시 불러온 경우의 안내. 시트가 새 값으로 다시 만들어져도 남도록 여기 둔다.
  const [conflict, setConflict] = useState(false);
  const menus = state.status === 'ok' ? state.data : null;
  const target = editing?.kind === 'edit' ? menus?.find((m) => m.id === editing.id) : undefined;
  // 고치는 메뉴를 아직(다시) 불러오는 중이면 시트를 잠깐 닫아 둔다 — 빈 "추가" 시트로 바뀌지 않게.
  const sheetOpen = editing !== null && (editing.kind === 'new' || target !== undefined);
  // 시트를 열 때마다 새로 만든다(번호를 올림) — 바로 전에 추가·고치던 입력이 남지 않게(#61 리뷰 🔴).
  // 예외: 결과를 모르는 저장(응답 끊김)으로 닫은 시트를 같은 대상으로 다시 열면, 입력과 재시도 키를 그대로 둔다(#59 리뷰).
  const [session, setSession] = useState(0);
  const unknownResult = useRef<Editing | null>(null);
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
      <h1 className="text-xl font-semibold text-ink">메뉴</h1>
      {state.status === 'loading' && <p className="py-8 text-center text-sm text-ink-soft">불러오는 중…</p>}
      {state.status === 'error' && <ErrorState onRetry={reload} />}
      {menus && <MenuList menus={menus} reload={reload} onAdd={() => openSheet({ kind: 'new' })} onEdit={(id) => openSheet({ kind: 'edit', id })} />}
      <MenuSheet
        // 고치는 메뉴가 바뀌거나 다시 불러와 version이 바뀌면 입력을 새 값으로 다시 채운다(#60 리뷰 🟡1).
        key={`${target ? `${target.id}:${target.version}` : 'new'}:${session}`}
        open={sheetOpen}
        target={target}
        conflict={conflict}
        onConflict={() => setConflict(true)}
        onClose={closeSheet}
        reload={reload}
      />
    </div>
  );
}

const sameEditing = (a: Editing | null, b: Editing) =>
  a !== null && a.kind === b.kind && (a.kind === 'new' || (b.kind === 'edit' && a.id === b.id));

function MenuList({ menus, reload, onAdd, onEdit }: { menus: Menu[]; reload: () => void; onAdd: () => void; onEdit: (id: string) => void }) {
  const api = useSettingsApi();
  const show = useSaveAction(reload);
  const [showing, setShowing] = useState('');
  const active = menus.filter((m) => m.active);
  const hidden = menus.filter((m) => !m.active);

  async function showAgain(m: Menu) {
    show.clear(); // 다른 메뉴일 수 있다 — 새 키로.
    setShowing(m.name);
    const done = await show.run((idempotencyKey) => api.updateMenu(m.id, { version: m.version, active: true }, { idempotencyKey }));
    if (done) reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionButton variant="neutralWeak" onClick={onAdd}>
        메뉴 추가
      </ActionButton>
      {show.problem && 'message' in show.problem && (
        <p role="alert" className="text-sm text-critical-text">
          {showing}: {show.problem.message}
        </p>
      )}

      {active.length === 0 ? (
        <EmptyState title="등록한 메뉴가 없어요" description="예약할 때 고를 메뉴를 추가해 주세요." />
      ) : (
        <ul aria-label="메뉴 목록" className="flex flex-col divide-y divide-line">
          {active.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onEdit(m.id)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                <span className="flex flex-col">
                  <span className="text-base text-ink">{m.name}</span>
                  <span className="text-sm text-ink-soft">{menuTimeText(m)}</span>
                </span>
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
          <summary className="cursor-pointer py-2 text-sm text-ink-soft">숨긴 메뉴 {hidden.length}개</summary>
          <ul aria-label="숨긴 메뉴" className="flex flex-col divide-y divide-line">
            {hidden.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span className="text-base text-ink-soft">{m.name}</span>
                  <span className="text-sm text-ink-soft">{menuTimeText(m)}</span>
                </span>
                <ActionButton variant="ghost" size="small" disabled={show.saving} onClick={() => showAgain(m)} aria-label={`${m.name} 다시 보이기`}>
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

export const MENU_CONFLICT_TEXT = '다른 곳에서 먼저 고쳤어요. 새 내용을 불러왔으니 확인하고 다시 저장해 주세요.';

function MenuSheet({
  open,
  target,
  conflict,
  onConflict,
  onClose,
  reload,
}: {
  open: boolean;
  target: Menu | undefined;
  conflict: boolean;
  onConflict: () => void;
  /** resultUnknown: 결과를 모르는 저장(응답 끊김) 뒤에 닫았는가. */
  onClose: (resultUnknown: boolean) => void;
  reload: () => void;
}) {
  const api = useSettingsApi();
  const save = useSaveAction(reload);
  const [name, setName] = useState(target?.name ?? '');
  const [duration, setDuration] = useState(minutesText(target?.defaultDurationMin ?? null));
  const [prep, setPrep] = useState(minutesText(target?.defaultPrepMin ?? null));
  const fieldError = (f: ResourceField) => (save.problem?.kind === 'fields' ? save.problem.fields[f] : undefined);
  // 충돌 안내는 위(MENU_CONFLICT_TEXT)에서 따로 보인다.
  const message = save.problem && 'message' in save.problem && save.problem.kind !== 'conflict' ? save.problem.message : undefined;

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    save.clear();
  };

  async function finish(write: (key: string) => Promise<Menu>) {
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
    const fields = { name, defaultDurationMin: parseMinutes(duration), defaultPrepMin: parseMinutes(prep) };
    void finish((idempotencyKey) =>
      target ? api.updateMenu(target.id, { ...fields, version: target.version }, { idempotencyKey }) : api.addMenu(fields, { idempotencyKey }),
    );
  }

  function hide() {
    if (!target) return;
    save.clear(); // 저장과 다른 일 — 새 키로.
    void finish((idempotencyKey) => api.updateMenu(target.id, { version: target.version, active: false }, { idempotencyKey }));
  }

  // 결과를 모르는 저장(응답 끊김)은 닫아도 입력과 키를 그대로 두고 목록을 다시 읽는다(#59 리뷰와 같은 이유).
  function close(next: boolean) {
    if (next) return;
    const unknown = save.problem?.kind === 'failed';
    onClose(unknown);
    if (unknown) reload();
  }

  const title = target ? '메뉴 고치기' : '메뉴 추가';
  return (
    <ResponsiveDialog.Root open={open} onOpenChange={close}>
      <ResponsiveDialog.Positioner>
        <ResponsiveDialog.Backdrop />
        <ResponsiveDialog.Content>
          <ResponsiveDialog.Header>
            <ResponsiveDialog.Title>{title}</ResponsiveDialog.Title>
          </ResponsiveDialog.Header>
          <form id="menu-form" noValidate onSubmit={submit}>
            <ResponsiveDialog.Body>
              <fieldset disabled={save.saving} className="flex flex-col gap-4 pb-2">
                {conflict && (
                  <p role="alert" className="text-sm text-critical-text">
                    {MENU_CONFLICT_TEXT}
                  </p>
                )}
                <FieldBox label="이름" error={fieldError('name')}>
                  <input value={name} onChange={(e) => edit(setName)(e.target.value)} placeholder="예: 수분 관리" autoComplete="off" className={INPUT} />
                </FieldBox>
                <MinutesField label="관리 시간 (분)" value={duration} chips={DURATION_CHIPS} error={fieldError('defaultDurationMin')} onChange={edit(setDuration)} />
                <MinutesField
                  label="준비 시간 (분)"
                  value={prep}
                  chips={PREP_CHIPS}
                  help={PREP_HELP_TEXT}
                  error={fieldError('defaultPrepMin')}
                  onChange={edit(setPrep)}
                />
                <p className="text-sm text-ink-soft">비워 두면 예약할 때 직접 정해요.</p>
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
              <ActionButton type="submit" form="menu-form" variant="brandSolid" size="large" loading={save.saving} className="w-full">
                저장
              </ActionButton>
              {target && (
                <ActionButton variant="ghost" disabled={save.saving} onClick={hide} className="w-full">
                  메뉴 숨기기
                </ActionButton>
              )}
            </div>
          </ResponsiveDialog.Footer>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Positioner>
    </ResponsiveDialog.Root>
  );
}

function MinutesField({
  label,
  value,
  chips,
  help,
  error,
  onChange,
}: {
  label: string;
  value: string;
  chips: readonly number[];
  help?: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldBox label={label} help={help} error={error}>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" autoComplete="off" className={INPUT} />
      </FieldBox>
      <div role="group" aria-label={`${label} 빠른 선택`} className="flex flex-wrap gap-2">
        {chips.map((n) => (
          <Chip.Button key={n} type="button" variant="outlineStrong" size="small" onClick={() => onChange(String(n))}>
            <Chip.Label>{n}분</Chip.Label>
          </Chip.Button>
        ))}
      </div>
    </div>
  );
}

const INPUT = 'min-h-10 w-full rounded-md border border-control-line bg-surface px-3 text-base text-ink';

function FieldBox({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink">
      {label}
      {children}
      {error && <span className="font-normal text-critical-text">{error}</span>}
      {help && <span className="font-normal text-ink-soft">{help}</span>}
    </label>
  );
}
