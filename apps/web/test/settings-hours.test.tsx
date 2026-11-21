// BEA-166 수용 기준(영업시간): 저장하고 다시 열면 그대로 · 잘못된 시각은 이유와 함께 거부 · 실패 ≠ 비어 있음. 데이터는 합성(절대 규칙 8).
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { SessionLoaderProvider } from '@/features/auth/session';
import { createMemorySettingsApi, SettingsApiProvider, type SettingsApi } from '@/features/settings/api';
import { fromDraft, hoursSummary, timeOptions, toDraft, weekdayAt } from '@/features/settings/hours';
import { seedSettings } from '@/features/settings/mockData';
import { HOURS_SAVED_TEXT, HOURS_UNSET_TEXT } from '@/pages/settings/HoursPage';
import { routes } from '@/routes';

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

const unsetApi = () => createMemorySettingsApi({ ...seedSettings(), businessHours: null });
const daySwitch = (day: string) => screen.getByRole('switch', { name: day });
const select = (label: string) => screen.getByRole('combobox', { name: label });

describe('영업시간 값 바꾸기', () => {
  it('아직 안 넣었으면 모든 요일을 10:00~20:00 예시로 켜 둔다', () => {
    const d = toDraft(null);
    expect(Object.values(d).every((x) => x.isOpen && x.open === '10:00' && x.close === '20:00')).toBe(true);
  });

  it('쉬는 날은 키를 빼고, 화면이 고치지 않는 2번째 구간은 그대로 보낸다', () => {
    const d = toDraft({ '2': [{ open: '10:00', close: '13:00' }, { open: '14:00', close: '20:00' }] });
    expect(d[1].isOpen).toBe(false);
    expect(fromDraft(d)).toEqual({ '2': [{ open: '10:00', close: '13:00' }, { open: '14:00', close: '20:00' }] });
  });

  it('목록 한 줄 요약', () => {
    expect(hoursSummary(null)).toBe('아직 안 넣음');
    expect(hoursSummary({})).toBe('모두 쉬는 날');
    expect(hoursSummary(seedSettings().businessHours)).toBe('화~일');
    const w = [{ open: '10:00', close: '18:00' }];
    expect(hoursSummary({ '1': w, '3': w, '5': w })).toBe('월·수·금');
    expect(hoursSummary({ '6': w, '7': w })).toBe('토·일');
  });

  it('30분 단위가 아닌 저장 값도 목록에 남긴다 · 오류 위치에서 요일을 꺼낸다', () => {
    expect(timeOptions(['10:00', '10:30'], '10:15')).toEqual(['10:00', '10:15', '10:30']);
    expect(weekdayAt('2[0]')).toBe(2);
    expect(weekdayAt('7')).toBe(7);
    expect(weekdayAt(undefined)).toBeNull();
  });
});

describe('설정 목록', () => {
  it('영업시간 요약을 보이고, 누르면 영업시간 화면으로 간다. 아직 없는 항목은 준비 중', async () => {
    const router = renderAt('/settings');
    const list = await screen.findByRole('list', { name: '설정 항목' });
    const hours = await within(list).findByRole('link', { name: /영업시간.*화~일/ });
    expect(within(list).getByText('담당자').closest('[aria-disabled="true"]')).not.toBeNull();
    await userEvent.click(hours);
    expect(router.state.location.pathname).toBe('/settings/hours');
  });
});

describe('영업시간 화면', () => {
  it('월요일을 켜고 시각을 골라 저장하면, 다시 열어도 그대로다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/hours', api);
    await userEvent.click(await screen.findByRole('switch', { name: '월' }));
    await userEvent.selectOptions(select('월요일 여는 시각'), '09:30');
    await userEvent.selectOptions(select('월요일 닫는 시각'), '24:00');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('status')).toHaveTextContent(HOURS_SAVED_TEXT);
    expect((await api.getBusinessHours())?.['1']).toEqual([{ open: '09:30', close: '24:00' }]);

    cleanup();
    renderAt('/settings/hours', api);
    expect(await screen.findByRole('switch', { name: '월' })).toBeChecked();
    expect(select('월요일 여는 시각')).toHaveValue('09:30');
  });

  it('저장하면 화면을 저장된 모양(구간 정렬)으로 맞춘다 — 다시 열었을 때와 같다', async () => {
    const api = createMemorySettingsApi({
      ...seedSettings(),
      businessHours: { '2': [{ open: '10:00', close: '13:00' }, { open: '14:00', close: '20:00' }] },
    });
    renderAt('/settings/hours', api);
    // 첫 구간을 둘째 구간보다 늦게 옮긴다 → 저장 값은 [14:00~20:00, 20:30~21:00]
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '화요일 닫는 시각' }), '21:00');
    await userEvent.selectOptions(select('화요일 여는 시각'), '20:30');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('status');
    expect(select('화요일 여는 시각')).toHaveValue('14:00');
    expect(select('화요일 닫는 시각')).toHaveValue('20:00');
  });

  it('요일을 끄면 쉬는 날로 저장된다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/hours', api);
    await userEvent.click(await screen.findByRole('switch', { name: '일' }));
    expect(screen.queryByRole('combobox', { name: '일요일 여는 시각' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('status');
    expect((await api.getBusinessHours())?.['7']).toBeUndefined();
  });

  it('닫는 시각이 여는 시각보다 빠르면 그 요일 줄에 이유를 보이고 저장하지 않는다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/hours', api);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '화요일 여는 시각' }), '21:00');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('화요일: 여는 시각이 닫는 시각보다 빨라야 해요.');
    expect((await api.getBusinessHours())?.['2']).toEqual([{ open: '10:00', close: '20:00' }]);
    // 고치기 시작하면 문구를 닫는다.
    await userEvent.selectOptions(select('화요일 여는 시각'), '10:00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('아직 안 넣은 매장은 안내와 예시 값을 보이고, 저장하면 안내가 사라진다', async () => {
    const api = unsetApi();
    renderAt('/settings/hours', api);
    expect(await screen.findByText(HOURS_UNSET_TEXT)).toBeInTheDocument();
    expect(daySwitch('월')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('status');
    expect(screen.queryByText(HOURS_UNSET_TEXT)).toBeNull();
    expect(Object.keys((await api.getBusinessHours()) ?? {})).toHaveLength(7);
  });

  it('불러오기 실패는 빈 화면이 아니라 다시 시도로 보인다', async () => {
    const api = createMemorySettingsApi();
    let fail = true;
    const flaky: SettingsApi = { ...api, getBusinessHours: () => (fail ? Promise.reject(new Error('offline')) : api.getBusinessHours()) };
    renderAt('/settings/hours', flaky);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('switch', { name: '화' })).toBeChecked();
  });

  it('저장이 끊기면 다시 누를 수 있고, 같은 키로 다시 보낸다', async () => {
    const api = createMemorySettingsApi();
    const keys: (string | undefined)[] = [];
    let fail = true;
    const flaky: SettingsApi = {
      ...api,
      putBusinessHours: (h, o) => {
        keys.push(o?.idempotencyKey);
        return fail ? Promise.reject(new Error('offline')) : api.putBusinessHours(h, o);
      },
    };
    renderAt('/settings/hours', flaky);
    await userEvent.click(await screen.findByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('status');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
