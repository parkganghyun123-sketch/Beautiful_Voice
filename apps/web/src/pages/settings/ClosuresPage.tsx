// 휴무·휴가(W13, BEA-166): 날짜 휴무(공휴일·휴가)를 추가·지우기. 고치기는 없다(계약: 추가·삭제만).
// 매주 쉬는 요일은 영업시간 화면의 "정기 휴무" 스위치가 정한다(W13 디자인 11/20) — 여기에는 날짜 휴무만 있다.
// 추가는 폰에서 아래 시트, 노트북에서 가운데 창(SEED ResponsiveDialog, 해나 11/21 결정).
// 지우기는 한 번 더 묻지 않는다 — 기록은 서버에 남고(removed), 같은 휴무를 다시 넣으면 된다(디자인 정책: 되돌릴 수 없는 일만 묻는다).
import type { Closure } from '@bv/contracts';
import { ActionButton, ResponsiveDialog, SegmentedControl, SegmentedControlItemHiddenInput } from '@seed-design/react';
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/states/DataState';
import { shopToday } from '@/features/customers/model';
import { useSettingsApi } from '@/features/settings/api';
import { groupClosures, KIND_TEXT, noLocalChanges, toClosureInput, withLocalChanges, type ClosureDraft, type LocalChanges } from '@/features/settings/closures';
import { closureText } from '@/features/settings/messages';
import { useSaveAction } from '@/features/settings/useSaveAction';
import { useLoad } from '@/lib/useLoad';

export const WEEKLY_MOVED_TEXT = '매주 쉬는 요일은 영업시간에서 정기 휴무로 정해요.';

export function ClosuresPage() {
  const api = useSettingsApi();
  const load = useCallback(() => api.listClosures(), [api]);
  const { state, reload } = useLoad(load);
  // 시트와 "방금 바뀐 것"은 목록 바깥에 둔다 — 목록을 다시 불러와도 시트의 입력·재시도 키가 사라지지 않게(#59 리뷰).
  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState<LocalChanges>(() => noLocalChanges([]));
  const closures = state.status === 'ok' ? state.data : null;
  const mine = closures && local.base === closures ? local : noLocalChanges(closures ?? []);
  // 매주 휴무는 영업시간 화면 몫이라 여기서는 날짜 휴무만 보인다.
  const shown = closures ? withLocalChanges(closures, mine).filter((c) => c.kind !== 'weekly') : [];

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:max-w-lg">
      <Link to="/settings" className="text-sm text-ink-soft">
        ‹ 설정
      </Link>
      <h1 className="text-xl font-semibold text-ink">휴무·휴가</h1>
      {state.status === 'loading' && <p className="py-8 text-center text-sm text-ink-soft">불러오는 중…</p>}
      {state.status === 'error' && <ErrorState onRetry={reload} />}
      {closures && (
        <ClosureList
          closures={shown}
          reload={reload}
          onAdd={() => setAdding(true)}
          onRemoved={(id) => setLocal({ ...mine, removed: [...mine.removed, id] })}
        />
      )}
      <AddClosureSheet
        open={adding}
        onOpenChange={setAdding}
        reload={reload}
        onAdded={(created) => setLocal({ ...mine, added: [...mine.added, created] })}
      />
    </div>
  );
}

function ClosureList({
  closures,
  reload,
  onAdd,
  onRemoved,
}: {
  closures: Closure[];
  reload: () => void;
  onAdd: () => void;
  onRemoved: (id: string) => void;
}) {
  const api = useSettingsApi();
  const remove = useSaveAction(reload);
  const { upcoming, past } = groupClosures(closures, shopToday());

  const lastTarget = useRef<string | null>(null);
  async function removeOne(id: string) {
    // 연결이 끊긴 지우기를 다시 누를 때만 같은 키를 쓴다. 다른 항목이면 새 키(같은 키면 서버가 앞 항목 결과를 돌려준다).
    if (lastTarget.current !== id) remove.clear();
    lastTarget.current = id;
    const done = await remove.run(async (idempotencyKey) => {
      await api.removeClosure(id, { idempotencyKey });
      return true;
    });
    if (done) {
      onRemoved(id);
      reload();
    }
  }

  const row = (c: Closure) => <ClosureRow key={c.id} closure={c} disabled={remove.saving} onRemove={() => removeOne(c.id)} />;

  return (
    <div className="flex flex-col gap-5">
      <ActionButton variant="neutralWeak" onClick={onAdd}>
        휴무 추가
      </ActionButton>
      {remove.problem && 'message' in remove.problem && (
        <p role="alert" className="text-sm text-critical-text">
          {remove.problem.message}
        </p>
      )}

      {closures.length === 0 && <EmptyState title="등록한 휴무가 없어요" description="공휴일이나 휴가를 추가해 주세요." />}
      {upcoming.length > 0 && <Section title="다가오는 휴무">{upcoming.map(row)}</Section>}
      {past.length > 0 && (
        <details className="text-ink">
          <summary className="cursor-pointer py-2 text-sm text-ink-soft">지난 휴무 {past.length}개</summary>
          <ul className="flex flex-col divide-y divide-line">{past.map(row)}</ul>
        </details>
      )}
      <Link to="/settings/hours" className="text-sm text-ink-soft underline">
        {WEEKLY_MOVED_TEXT}
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>
      <ul aria-label={title} className="flex flex-col divide-y divide-line">
        {children}
      </ul>
    </section>
  );
}

function ClosureRow({ closure, disabled, onRemove }: { closure: Closure; disabled: boolean; onRemove: () => void }) {
  const text = closureText(closure);
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span className="flex flex-col">
        <span className="text-base text-ink">{text}</span>
        {closure.kind !== 'weekly' && <span className="text-sm text-ink-soft">{KIND_TEXT[closure.kind]}</span>}
      </span>
      <ActionButton variant="ghost" size="small" disabled={disabled} onClick={onRemove} aria-label={`${text} 지우기`}>
        지우기
      </ActionButton>
    </li>
  );
}

const emptyDraft = (): ClosureDraft => ({ kind: 'vacation', startDate: '', endDate: '', note: '' });

function AddClosureSheet({
  open,
  onOpenChange,
  reload,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reload: () => void;
  onAdded: (created: Closure) => void;
}) {
  const api = useSettingsApi();
  const save = useSaveAction(reload);
  const [draft, setDraft] = useState<ClosureDraft>(emptyDraft);

  function change(patch: Partial<ClosureDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    save.clear();
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (next) return;
    if (save.problem?.kind === 'failed') {
      // 결과를 모르는 추가(응답이 끊김): 서버에는 저장됐을 수 있다(#59 리뷰).
      // 입력과 키를 그대로 두고 목록을 다시 읽는다 — 저장됐으면 목록에 보이고, 같은 입력으로 다시 누르면 같은 키라 두 줄이 되지 않는다.
      reload();
      return;
    }
    setDraft(emptyDraft());
    save.clear();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await save.run((idempotencyKey) => api.addClosure(toClosureInput(draft), { idempotencyKey }));
    if (created !== undefined) {
      onAdded(created);
      close(false);
      reload();
    }
  }

  return (
    <ResponsiveDialog.Root open={open} onOpenChange={close}>
      <ResponsiveDialog.Positioner>
        <ResponsiveDialog.Backdrop />
        <ResponsiveDialog.Content>
          <ResponsiveDialog.Header>
            <ResponsiveDialog.Title>휴무 추가</ResponsiveDialog.Title>
          </ResponsiveDialog.Header>
          <form id="add-closure" noValidate onSubmit={submit}>
            <ResponsiveDialog.Body>
              <fieldset disabled={save.saving} className="flex flex-col gap-4 pb-2">
                <SegmentedControl.Root aria-label="휴무 종류" value={draft.kind} onValueChange={(v) => change({ kind: v as ClosureDraft['kind'] })}>
                  <SegmentedControl.Indicator />
                  {(['holiday', 'vacation'] as const).map((k) => (
                    <SegmentedControl.Item key={k} value={k}>
                      <SegmentedControlItemHiddenInput />
                      {KIND_TEXT[k]}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>

                <div className="grid grid-cols-2 gap-3">
                  <FieldBox label="시작일">
                    <input type="date" value={draft.startDate} onChange={(e) => change({ startDate: e.target.value })} className={INPUT} />
                  </FieldBox>
                  <FieldBox label="끝나는 날" help="비우면 하루만">
                    <input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => change({ endDate: e.target.value })} className={INPUT} />
                  </FieldBox>
                </div>
                <FieldBox label="메모 (선택)">
                  <input value={draft.note} onChange={(e) => change({ note: e.target.value })} placeholder="예: 연말 휴가" autoComplete="off" className={INPUT} />
                </FieldBox>

                {save.problem && 'message' in save.problem && (
                  <p role="alert" className="text-sm text-critical-text">
                    {save.problem.message}
                  </p>
                )}
              </fieldset>
            </ResponsiveDialog.Body>
          </form>
          <ResponsiveDialog.Footer>
            <ActionButton type="submit" form="add-closure" variant="brandSolid" size="large" loading={save.saving} className="w-full">
              추가
            </ActionButton>
          </ResponsiveDialog.Footer>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Positioner>
    </ResponsiveDialog.Root>
  );
}

const INPUT = 'min-h-10 w-full rounded-md border border-control-line bg-surface px-3 text-base text-ink';

function FieldBox({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink">
      {label}
      {children}
      {help && <span className="font-normal text-ink-soft">{help}</span>}
    </label>
  );
}
