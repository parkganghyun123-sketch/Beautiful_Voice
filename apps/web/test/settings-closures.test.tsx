// BEA-166 수용 기준(휴무): 매주 쉬는 요일과 날짜 휴무(공휴일·휴가) 추가·지우기 · 잘못된 날짜는 이유와 함께 거부. 데이터는 합성(절대 규칙 8).
import type { Closure } from '@bv/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionLoaderProvider } from '@/features/auth/session';
import { createMemorySettingsApi, SettingsApiProvider, type SettingsApi } from '@/features/settings/api';
import { closuresSummary, groupClosures, noLocalChanges, toClosureInput, withLocalChanges } from '@/features/settings/closures';
import { seedSettings } from '@/features/settings/mockData';
import { routes } from '@/routes';

// 매장 날짜를 2026-11-21(서울)로 고정한다 — 합성 휴가(12/24~26)가 "다가오는 휴무"에 머물도록. 날짜만 가짜로 둔다.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-21T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function renderAt(path: string, api: SettingsApi = createMemorySettingsApi()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionLoaderProvider value={async () => ({ shopId: 'shop-1' })}>
      <SettingsApiProvider value={api}>
        <RouterProvider router={router} />
      </SettingsApiProvider>
    </SessionLoaderProvider>,
  );
  return router;
}

const day = (id: string, kind: 'holiday' | 'vacation', startDate: string, endDate = startDate): Closure => ({ id, kind, startDate, endDate, note: null });
const section = (name: string) => screen.findByRole('list', { name });
const texts = (list: HTMLElement) => within(list).getAllByRole('listitem').map((li) => li.textContent);

async function openSheet() {
  await userEvent.click(await screen.findByRole('button', { name: '휴무 추가' }));
  return screen.findByRole('dialog', { name: '휴무 추가' });
}

describe('휴무 묶기·문구', () => {
  it('매주는 요일 순, 날짜 휴무는 오늘 기준으로 다가오는 것(시작일 순)과 지난 것(최근부터)으로 나눈다', () => {
    const g = groupClosures(
      [
        day('a', 'vacation', '2026-12-24', '2026-12-26'),
        { id: 'w5', kind: 'weekly', weekday: 5, note: null },
        day('b', 'holiday', '2026-11-21'),
        day('c', 'holiday', '2026-10-03'),
        { id: 'w1', kind: 'weekly', weekday: 1, note: null },
        day('d', 'vacation', '2026-08-01', '2026-08-03'),
      ],
      '2026-11-21',
    );
    expect(g.weekly.map((c) => c.id)).toEqual(['w1', 'w5']);
    expect(g.upcoming.map((c) => c.id)).toEqual(['b', 'a']); // 오늘 끝나는 휴무는 아직 다가오는 쪽
    expect(g.past.map((c) => c.id)).toEqual(['c', 'd']);
  });

  it('설정 목록 요약은 지난 휴무를 세지 않는다', () => {
    expect(closuresSummary(seedSettings().closures, '2026-11-21')).toBe('매주 월 · 예정 1개');
    expect(closuresSummary(seedSettings().closures, '2027-01-01')).toBe('매주 월');
    expect(closuresSummary([], '2026-11-21')).toBe('없음');
  });

  it('끝나는 날을 비우면 하루짜리, 빈 메모는 저장하지 않는다', () => {
    expect(toClosureInput({ kind: 'holiday', weekday: 1, startDate: '2026-12-25', endDate: '', note: '  ' })).toEqual({
      kind: 'holiday',
      startDate: '2026-12-25',
      endDate: '2026-12-25',
      note: null,
    });
    expect(toClosureInput({ kind: 'weekly', weekday: 3, startDate: '', endDate: '', note: '정기 휴무' })).toEqual({ kind: 'weekly', weekday: 3, note: '정기 휴무' });
  });
});

describe('방금 바뀐 휴무 반영(#59·#60 리뷰)', () => {
  it('새 목록이 오기 전에는 방금 추가·지운 것을 반영하고, 같은 id는 한 번만 보인다', () => {
    const base = seedSettings().closures;
    const added = day('n', 'holiday', '2026-12-25');
    const local = { base, added: [added, { ...base[0]! }], removed: ['closure-2'] };
    expect(withLocalChanges(base, local).map((c) => c.id)).toEqual(['closure-1', 'n']);
  });

  it('새 목록(다른 배열)이 오면 방금 바뀐 것을 버린다 — 새 목록에 이미 들어 있다', () => {
    const base = seedSettings().closures;
    const local = { ...noLocalChanges(base), removed: ['closure-1'] };
    const fresh = [...base];
    expect(withLocalChanges(fresh, local).map((c) => c.id)).toEqual(['closure-1', 'closure-2']);
  });
});

describe('휴무·휴가 화면', () => {
  it('설정 목록에서 요약을 보고 들어간다', async () => {
    const router = renderAt('/settings');
    await userEvent.click(await screen.findByRole('link', { name: /휴무·휴가.*매주 월 · 예정 1개/ }));
    expect(router.state.location.pathname).toBe('/settings/closures');
  });

  it('매주 쉬는 요일과 다가오는 휴무를 나눠 보인다', async () => {
    renderAt('/settings/closures');
    expect(texts(await section('매주 쉬는 요일'))).toEqual(['매주 월요일지우기']);
    expect(texts(await section('다가오는 휴무'))).toEqual(['12월 24일 ~ 12월 26일 · 연말 휴가휴가지우기']);
  });

  it('공휴일을 하루짜리로 추가하면 시트가 닫히고 목록에 보인다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/closures', api);
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('radio', { name: '공휴일' }));
    await userEvent.type(within(sheet).getByLabelText('시작일'), '2026-12-25');
    await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(texts(await section('다가오는 휴무'))).toEqual(['12월 24일 ~ 12월 26일 · 연말 휴가휴가지우기', '12월 25일공휴일지우기']);
    expect((await api.listClosures()).at(-1)).toMatchObject({ kind: 'holiday', startDate: '2026-12-25', endDate: '2026-12-25', note: null });
  });

  it('매주 쉬는 요일은 이미 넣은 요일을 빼고 고른다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/closures', api);
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('radio', { name: '매주' }));
    const select = within(sheet).getByLabelText(/쉬는 요일/);
    expect(within(select).queryByRole('option', { name: '월요일' })).toBeNull();
    await userEvent.selectOptions(select, '3');
    await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(texts(await section('매주 쉬는 요일'))).toEqual(['매주 월요일지우기', '매주 수요일지우기']);
  });

  it('매주 휴무를 연달아 추가해도 같은 요일이 두 번 저장되지 않는다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/closures', api);
    for (let i = 0; i < 2; i++) {
      const sheet = await openSheet();
      await userEvent.click(within(sheet).getByRole('radio', { name: '매주' }));
      await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect((await api.listClosures()).flatMap((c) => (c.kind === 'weekly' ? [c.weekday] : []))).toEqual([1, 2, 3]);
  });

  it('시작일이 끝나는 날보다 늦으면 이유를 보이고 저장하지 않는다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/closures', api);
    const sheet = await openSheet();
    await userEvent.type(within(sheet).getByLabelText('시작일'), '2026-12-27');
    await userEvent.type(within(sheet).getByLabelText(/끝나는 날/), '2026-12-26');
    await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('시작일이 끝나는 날보다 늦어요.');
    expect(await api.listClosures()).toHaveLength(2);
  });

  it('지우기는 한 번에 지운다(다시 묻지 않음)', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/closures', api);
    await userEvent.click(await screen.findByRole('button', { name: '매주 월요일 지우기' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: '매주 쉬는 요일' })).toBeNull());
    expect((await api.listClosures()).map((c) => c.id)).toEqual(['closure-2']);
  });

  it('지난 휴무는 접어 둔다', async () => {
    const api = createMemorySettingsApi({ ...seedSettings(), closures: [day('p', 'vacation', '2026-08-01', '2026-08-03')] });
    renderAt('/settings/closures', api);
    expect(await screen.findByText('지난 휴무 1개')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '다가오는 휴무' })).toBeNull();
  });

  it('저장은 됐는데 응답만 끊긴 뒤 시트를 닫았다 다시 추가해도 두 줄이 되지 않는다(#59 리뷰)', async () => {
    const api = createMemorySettingsApi();
    const keys: (string | undefined)[] = [];
    let dropResponse = true;
    const flaky: SettingsApi = {
      ...api,
      addClosure: async (input, o) => {
        keys.push(o?.idempotencyKey);
        const created = await api.addClosure(input, o); // 서버에는 저장된다
        if (dropResponse) throw new Error('response lost');
        return created;
      },
    };
    renderAt('/settings/closures', flaky);
    let sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole('radio', { name: '공휴일' }));
    await userEvent.type(within(sheet).getByLabelText('시작일'), '2026-12-25');
    await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('저장하지 못했어요');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 닫으면 목록을 다시 읽어서, 이미 저장된 공휴일이 보인다.
    expect(texts(await section('다가오는 휴무'))).toContain('12월 25일공휴일지우기');

    dropResponse = false;
    sheet = await openSheet();
    expect(within(sheet).getByLabelText('시작일')).toHaveValue('2026-12-25'); // 입력이 그대로
    await userEvent.click(within(sheet).getByRole('button', { name: '추가' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect((await api.listClosures()).filter((c) => c.kind === 'holiday')).toHaveLength(1);
    expect(texts(await section('다가오는 휴무')).filter((t) => t?.startsWith('12월 25일'))).toHaveLength(1);
  });

  it('지우기가 끊기면 같은 항목은 같은 키로, 다른 항목은 새 키로 보낸다', async () => {
    const api = createMemorySettingsApi();
    const keys: (string | undefined)[] = [];
    let fail = true;
    const flaky: SettingsApi = {
      ...api,
      removeClosure: (id, o) => {
        keys.push(o?.idempotencyKey);
        return fail ? Promise.reject(new Error('offline')) : api.removeClosure(id, o);
      },
    };
    renderAt('/settings/closures', flaky);
    await userEvent.click(await screen.findByRole('button', { name: '매주 월요일 지우기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요');
    await userEvent.click(screen.getByRole('button', { name: '매주 월요일 지우기' }));
    await screen.findByRole('alert');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /12월 24일.*지우기/ }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
