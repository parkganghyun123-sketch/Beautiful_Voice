// BEA-175 수용 기준: 주·월 전환 / 관리·준비·차단이 다르게 보임 / 예약 카드에 고객·메뉴·담당자, 누르면 메모.
// 데이터는 합성(절대 규칙 8). 날짜는 주소로 고정해 언제 돌려도 같은 결과가 나오게 한다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionLoaderProvider } from '@/features/auth/session';
import { CalendarApiProvider, createMemoryCalendarApi, type CalendarApi } from '@/features/calendar/api';
import { seedCalendar } from '@/features/calendar/mockData';
import {
  appointmentTimeText,
  forStaff,
  hourRange,
  hoursBase,
  isClosedDay,
  monthGrid,
  outsideHours,
  overlapsBlock,
  segmentsForDay,
  weekDays,
  weekTitle,
  type CalendarAppointment,
  type CalendarBlock,
} from '@/features/calendar/model';
import { validDate } from '@/pages/calendar/CalendarPage';
import { routes } from '@/routes';
import { setTestWidth } from './setup';

// 2026-11-16(월) ~ 22(일) 주. 시드는 이 주 월요일 기준.
const API = () => createMemoryCalendarApi(seedCalendar('2026-11-18'));

function renderAt(path: string, api: CalendarApi = API()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionLoaderProvider value={async () => ({ shopId: 'shop-1' })}>
      <CalendarApiProvider value={api}>
        <RouterProvider router={router} />
      </CalendarApiProvider>
    </SessionLoaderProvider>,
  );
  return router;
}

const appt = (over: Partial<CalendarAppointment>): CalendarAppointment => ({
  id: 'x',
  customerName: '테스트',
  menuName: null,
  staffId: 's1',
  startAt: '2026-11-18T05:00:00Z', // 서울 14:00
  durationMin: 60,
  prepMin: 20,
  memo: null,
  status: 'scheduled',
  ...over,
});

describe('캘린더 배치 규칙', () => {
  it('주는 월요일부터 7일, 달력은 꽉 찬 주 단위', () => {
    expect(weekDays('2026-11-20')).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ]);
    const m = monthGrid('2026-11-20');
    expect(m[0]).toBe('2026-10-26');
    expect(m.at(-1)).toBe('2026-12-06');
    expect(m.length % 7).toBe(0);
  });

  it('점유 = [시작 − 준비, 시작 + 관리): 14:00·관리 60분·준비 20분 → 준비 13:40~14:00, 관리 14:00~15:00', () => {
    const segs = segmentsForDay('2026-11-18', { appointments: [appt({})], blocks: [] });
    expect(segs).toEqual([
      { kind: 'prep', sourceId: 'x', fromMin: 13 * 60 + 40, toMin: 14 * 60, staffId: 's1' },
      { kind: 'care', sourceId: 'x', fromMin: 14 * 60, toMin: 15 * 60, staffId: 's1' },
    ]);
    expect(appointmentTimeText(appt({}))).toBe('13:40 준비 · 14:00–15:00');
    expect(appointmentTimeText(appt({ prepMin: 0 }))).toBe('14:00–15:00');
  });

  it('자정을 넘는 예약은 날마다 잘라 그린다', () => {
    const late = appt({ startAt: '2026-11-18T14:30:00Z', durationMin: 60, prepMin: 0 }); // 서울 23:30~00:30
    expect(segmentsForDay('2026-11-18', { appointments: [late], blocks: [] })).toMatchObject([{ fromMin: 1410, toMin: 1440 }]);
    expect(segmentsForDay('2026-11-19', { appointments: [late], blocks: [] })).toMatchObject([{ fromMin: 0, toMin: 30 }]);
  });

  it('취소·되돌림 예약은 그리지 않는다, 완료·노쇼는 그린다', () => {
    const segs = segmentsForDay('2026-11-18', {
      appointments: [
        appt({ id: 'c', status: 'cancelled' }),
        appt({ id: 'v', status: 'voided' }),
        appt({ id: 'd', status: 'completed', prepMin: 0 }),
        appt({ id: 'n', status: 'no_show', prepMin: 0 }),
      ],
      blocks: [],
    });
    expect(segs.map((s) => s.sourceId)).toEqual(['d', 'n']);
  });

  it('차단: 매장 전체는 줄 하나(null), 담당자 지정은 담당자마다', () => {
    const blocks = [
      { id: 'all', startAt: '2026-11-18T03:00:00Z', endAt: '2026-11-18T04:00:00Z', allStaff: true, staffIds: [], memo: null },
      { id: 'two', startAt: '2026-11-18T03:00:00Z', endAt: '2026-11-18T04:00:00Z', allStaff: false, staffIds: ['s1', 's2'], memo: null },
    ];
    const segs = segmentsForDay('2026-11-18', { appointments: [], blocks });
    expect(segs.map((s) => [s.sourceId, s.staffId])).toEqual([['all', null], ['two', 's1'], ['two', 's2']]);
  });

  it('세로 범위는 기본 9~21시, 밖의 조각이 있으면 넓힌다', () => {
    expect(hourRange([])).toEqual([9, 21]);
    expect(hourRange([{ kind: 'care', sourceId: 'a', fromMin: 8 * 60 + 30, toMin: 22 * 60 + 10, staffId: null }])).toEqual([8, 23]);
  });
});

describe('W1 디자인 규칙(SEED 옮기기)', () => {
  it('주 제목은 목요일이 든 달의 몇째 주 — 11/23~29는 11월 넷째 주, 10/26~11/1은 10월 다섯째 주', () => {
    expect(weekTitle('2026-11-24')).toBe('11월 넷째 주');
    expect(weekTitle('2026-11-18')).toBe('11월 셋째 주');
    expect(weekTitle('2026-11-01')).toBe('10월 다섯째 주');
    expect(weekTitle('2026-12-02')).toBe('12월 첫째 주');
  });

  it('휴무: 매주 요일 휴무와 날짜 구간 휴가', () => {
    const closures = [
      { id: 'w', kind: 'weekly' as const, weekday: 7 as const, note: null },
      { id: 'v', kind: 'vacation' as const, startDate: '2026-11-25', endDate: '2026-11-26', note: null },
    ];
    expect(['2026-11-22', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map((d) => isClosedDay(d, closures))).toEqual([true, false, true, true, false]);
  });

  it('영업시간 밖 구간: 점심시간 포함, 안 넣었으면 없음, 그 요일 구간이 없으면 하루 전체', () => {
    const hours = { 3: [{ open: '14:00', close: '19:00' }, { open: '10:00', close: '13:00' }] };
    expect(outsideHours('2026-11-18', hours)).toEqual([[0, 600], [780, 840], [1140, 1440]]);
    expect(outsideHours('2026-11-18', null)).toEqual([]);
    expect(outsideHours('2026-11-19', hours)).toEqual([[0, 1440]]);
    expect(hoursBase(['2026-11-18'], hours)).toEqual([9, 20]);
    expect(hoursBase(['2026-11-18'], null)).toEqual([9, 21]);
  });

  it('영업이 24:00까지면 뒤쪽 회색이 없고 세로 범위는 24시를 넘지 않는다(자정을 넘는 구간은 설정 검사 #39가 거부)', () => {
    const late = { 3: [{ open: '18:00', close: '24:00' }] };
    expect(outsideHours('2026-11-18', late)).toEqual([[0, 1080]]);
    expect(hoursBase(['2026-11-18'], late)).toEqual([17, 24]);
  });

  it('겹침: 그 담당자(또는 매장 전체) 관리 불가와 점유 구간이 겹칠 때만 — 준비 시간도 점유', () => {
    const block = (over: Partial<CalendarBlock>): CalendarBlock => ({
      id: 'b', startAt: '2026-11-18T04:30:00Z', endAt: '2026-11-18T04:50:00Z', allStaff: false, staffIds: ['s1'], memo: null, ...over,
    }); // 서울 13:30~13:50 — 14:00 예약의 준비(13:40~)와 겹침
    expect(overlapsBlock(appt({}), [block({})])).toBe(true);
    expect(overlapsBlock(appt({ prepMin: 0 }), [block({})])).toBe(false);
    expect(overlapsBlock(appt({}), [block({ staffIds: ['s2'] })])).toBe(false);
    expect(overlapsBlock(appt({}), [block({ staffIds: [], allStaff: true })])).toBe(true);
  });

  it('담당자 거르기: 그 담당자 예약과, 그 담당자에게 걸린 차단·매장 전체 차단만', () => {
    const data = {
      staff: [{ id: 's1', name: '원장' }, { id: 's2', name: '보조' }],
      appointments: [appt({ id: 'a1', staffId: 's1' }), appt({ id: 'a2', staffId: 's2' })],
      blocks: [
        { id: 'all', startAt: 'x', endAt: 'y', allStaff: true, staffIds: [], memo: null },
        { id: 'only2', startAt: 'x', endAt: 'y', allStaff: false, staffIds: ['s2'], memo: null },
      ],
      businessHours: null,
      closures: [],
    };
    const s1 = forStaff(data, 's1');
    // A·B 둘에게 걸린 차단을 A로 거르면 A 조각만 — B 조각이 전체 폭으로 겹쳐 그려지지 않게(#50 리뷰)
    const both = { ...data, blocks: [{ id: 'ab', startAt: '2026-11-18T01:00:00Z', endAt: '2026-11-18T02:00:00Z', allStaff: false, staffIds: ['s1', 's2'], memo: null }] };
    const onlyA = forStaff(both, 's1');
    expect(onlyA.blocks[0]!.staffIds).toEqual(['s1']);
    expect(segmentsForDay('2026-11-18', onlyA).filter((g) => g.kind === 'block').map((g) => g.staffId)).toEqual(['s1']);
    expect([s1.staff.map((s) => s.id), s1.appointments.map((a) => a.id), s1.blocks.map((b) => b.id)]).toEqual([['s1'], ['a1'], ['all']]);
    expect(forStaff(data, null)).toBe(data);
  });
});

describe('캘린더 화면', () => {
  afterEach(() => vi.useRealTimers());

  it('관리 불가와 겹친 예약은 빨간 테두리와 "겹침", 완료는 옅게 + "완료", 노쇼는 "노쇼"', async () => {
    renderAt('/calendar?date=2026-11-18');
    const friday = await screen.findByRole('region', { name: '11월 20일' });
    const overlapped = within(friday).getByRole('button', { name: /한예린/ });
    expect(overlapped).toHaveAttribute('data-overlap', 'true');
    expect(overlapped).toHaveTextContent('겹침');
    const done = within(screen.getByRole('region', { name: '11월 16일' })).getByRole('button', { name: /김하늘/ });
    expect(done).toHaveAttribute('data-status', 'completed');
    expect(done).toHaveTextContent('완료');
    expect(done).not.toHaveTextContent('겹침');
    expect(within(screen.getByRole('region', { name: '11월 18일' })).getByRole('button', { name: /김하늘/ })).toHaveTextContent('노쇼');
  });

  it('영업시간 밖과 휴무일은 회색으로 덮는다', async () => {
    renderAt('/calendar?date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    expect(monday.querySelectorAll('[data-kind="closed"]').length).toBeGreaterThan(0); // 10시 전
    const sunday = screen.getByRole('region', { name: '11월 22일' });
    const cover = sunday.querySelector<HTMLElement>('[data-kind="closed"]')!;
    expect(cover.style.top).toBe('0px');
    expect(cover.style.height).toBe(sunday.style.height); // 하루 전체
  });

  it('담당자가 1명이면 칩이 없다', async () => {
    renderAt('/calendar?date=2026-11-18');
    await screen.findByRole('region', { name: '11월 16일' });
    expect(screen.queryByRole('radiogroup', { name: '담당자' })).not.toBeInTheDocument();
  });

  it('담당자가 2명이면 "전체·원장·보조" 칩으로 거르고, 카드에 담당자 이름이 보인다(가짜 담당자는 이 테스트에서만)', async () => {
    renderAt(
      '/calendar?date=2026-11-18',
      createMemoryCalendarApi({
        staff: [{ id: 's1', name: '원장' }, { id: 's2', name: '보조' }],
        appointments: [appt({ id: 'p1', customerName: '손님가', staffId: 's1' }), appt({ id: 'p2', customerName: '손님나', staffId: 's2' })],
        blocks: [],
      }),
    );
    const wed = await screen.findByRole('region', { name: '11월 18일' });
    const chips = screen.getByRole('radiogroup', { name: '담당자' });
    expect(within(chips).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['전체', '원장', '보조']);
    expect(within(chips).getByRole('radio', { name: '전체' })).toBeChecked();
    expect(within(wed).getByRole('button', { name: /손님가/ })).toHaveTextContent('원장');
    await userEvent.click(within(chips).getByRole('radio', { name: '보조' }));
    expect(within(wed).queryByRole('button', { name: /손님가/ })).not.toBeInTheDocument();
    expect(within(wed).getByRole('button', { name: /손님나/ }).style.width).toBe('100%');
  });

  it('오늘 칸에 지금 시각 빨간 줄이 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T05:30:00Z')); // 서울 수 14:30
    renderAt('/calendar?date=2026-11-18');
    const wed = await screen.findByRole('region', { name: '11월 18일' });
    const line = wed.querySelector<HTMLElement>('[data-kind="now"]')!;
    expect(line).not.toBeNull();
    expect(screen.getByRole('region', { name: '11월 17일' }).querySelector('[data-kind="now"]')).toBeNull();
  });

  it('주간 보기: 요일 7칸과 관리·준비·차단이 서로 다른 모양으로 보인다', async () => {
    renderAt('/calendar?date=2026-11-18');
    expect(await screen.findByRole('heading', { level: 2, name: '11월 셋째 주' })).toBeInTheDocument();
    await screen.findByRole('region', { name: '11월 16일' });
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['월 16', '화 17', '수 18', '목 19', '금 20', '토 21', '일 22 · 휴무']);
    expect(screen.getByRole('radio', { name: '주' })).toBeChecked();
    const kinds = new Set(Array.from(document.querySelectorAll('[data-kind]')).map((e) => e.getAttribute('data-kind')));
    for (const k of ['care', 'prep', 'block', 'closed']) expect(kinds).toContain(k);
  });

  it('예약 카드에 고객·메뉴·담당자가 보이고, 누르면 메모가 보인다', async () => {
    renderAt('/calendar?date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    const card = within(monday).getByRole('button', { name: /이서윤/ });
    expect(card).toHaveTextContent('이서윤등 관리'); // 담당자가 1명이면 담당자 이름은 숨긴다(W1)
    expect(card).not.toHaveTextContent('원장');
    await userEvent.click(card);
    const dialog = await screen.findByRole('dialog', { name: '이서윤' });
    expect(dialog).toHaveTextContent('임산부 — 복부 관리 제외');
    expect(dialog).toHaveTextContent('11/16(월) 14:00–15:00 · 60분');
    expect(dialog).toHaveTextContent('준비 20분 · 13:40부터 일정이 잡혀요');
    expect(dialog).toHaveTextContent('예정'); // scheduled 화면 표기
  });

  it('담당자가 2명이면 같은 시각 2건이 나란히 보인다(가짜 담당자는 이 테스트에서만)', async () => {
    const twoStaff = createMemoryCalendarApi({
      staff: [
        { id: 's1', name: '원장' },
        { id: 's2', name: '보조' },
      ],
      appointments: [
        appt({ id: 'p1', customerName: '손님가', staffId: 's1' }),
        appt({ id: 'p2', customerName: '손님나', staffId: 's2' }),
      ],
      blocks: [],
    });
    renderAt('/calendar?date=2026-11-18', twoStaff);
    const wed = await screen.findByRole('region', { name: '11월 18일' });
    const a = within(wed).getByRole('button', { name: /손님가/ });
    const b = within(wed).getByRole('button', { name: /손님나/ });
    expect(b).toHaveTextContent('보조');
    expect(a.style.top).toBe(b.style.top);
    expect(a.style.left).not.toBe(b.style.left);
  });

  it('담당자가 1명이면 예약 카드가 칸 전체 너비다', async () => {
    renderAt('/calendar?date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    const card = within(monday).getByRole('button', { name: /이서윤/ });
    expect(card.style.width).toBe('100%');
  });

  it('취소된 예약은 캘린더에 없다', async () => {
    renderAt('/calendar?date=2026-11-18');
    const thursday = await screen.findByRole('region', { name: '11월 19일' });
    expect(within(thursday).queryByRole('button')).not.toBeInTheDocument();
    expect(within(thursday).getByText('관리 불가 · 점심')).toBeInTheDocument();
  });

  it('주 ↔ 월 전환과 이전·다음 이동은 주소에 남는다', async () => {
    const router = renderAt('/calendar?date=2026-11-18');
    await screen.findByRole('region', { name: '11월 16일' });
    await userEvent.click(screen.getByRole('radio', { name: '월' }));
    expect(await screen.findByRole('heading', { level: 2, name: '2026년 11월' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?view=month&date=2026-11-18');
    const day = await screen.findByRole('region', { name: '11월 20일' });
    expect(within(day).getByRole('button', { name: /15:00 한예린/ })).toBeInTheDocument();
    expect(within(day).getByText('관리 불가 · 원장 외출')).toBeInTheDocument();
    // 월로 바꿔도 관리 불가와 겹친 예약은 "겹침"으로 보인다(R50, #50 리뷰)
    const overlapped = within(day).getByRole('button', { name: /15:00 한예린/ });
    expect(overlapped).toHaveAttribute('data-overlap', 'true');
    expect(overlapped).toHaveTextContent('겹침');

    await userEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(await screen.findByRole('heading', { level: 2, name: '2026년 12월' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '주' }));
    expect(await screen.findByRole('heading', { level: 2, name: '12월 첫째 주' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이전 주' }));
    expect(await screen.findByRole('heading', { level: 2, name: '11월 넷째 주' })).toBeInTheDocument();
  });

  it('월간 보기에서도 준비 시간이 있는 예약을 구분한다(관리 시작 + 준비 표시)', async () => {
    renderAt('/calendar?view=month&date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    const withPrep = within(monday).getByRole('button', { name: /14:00 이서윤/ });
    const prep = withPrep.querySelector('[data-kind="prep"]');
    expect(prep).toHaveTextContent('준비 20분');
    expect(prep).toHaveAttribute('title', '준비 13:40부터 20분');
    const tuesday = screen.getByRole('region', { name: '11월 17일' });
    const noPrep = within(tuesday).getByRole('button', { name: /11:30 최유나/ });
    expect(noPrep.querySelector('[data-kind="prep"]')).toBeNull();
  });

  it('주소의 날짜가 없는 날이면 오늘 기준으로 보여 준다', async () => {
    expect(validDate('2026-11-18')).toBe(true);
    expect(['2026-99-99', '2026-02-30', '2026-1-1', null].map(validDate)).toEqual([false, false, false, false]);
    renderAt('/calendar?date=2026-99-99');
    expect(await screen.findAllByRole('columnheader')).toHaveLength(7);
  });

  it('자정을 넘는 예약은 두 날 모두에 누를 수 있는 카드가 붙는다', async () => {
    const late = appt({ id: 'late', customerName: '심야손님', startAt: '2026-11-18T14:30:00Z', prepMin: 0 }); // 서울 수 23:30~목 00:30
    renderAt('/calendar?date=2026-11-18', createMemoryCalendarApi({ staff: [{ id: 's1', name: '원장' }], appointments: [late], blocks: [] }));
    for (const day of ['11월 18일', '11월 19일']) {
      const region = await screen.findByRole('region', { name: day });
      expect(within(region).getByRole('button', { name: /심야손님/ })).toBeInTheDocument();
    }
  });

  it('불러오기 실패는 경고와 다시 시도로 보인다', async () => {
    let fail = true;
    const ok = API();
    renderAt('/calendar?date=2026-11-18', { ...ok, range: (f, t) => (fail ? Promise.reject(new Error('x')) : ok.range(f, t)) });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('region', { name: '11월 16일' })).toBeInTheDocument();
  });
});

describe('폰·웹 배치(캘린더 PR 2a) — 너비 기준 SEED md 768', () => {
  it('폰 주 보기: 위 7일 띠와 고른 날 하루 시간표, 띠에서 날을 누르면 시간표와 ?date가 바뀐다', async () => {
    setTestWidth(390);
    const router = renderAt('/calendar?date=2026-11-18');
    const strip = await screen.findByRole('group', { name: '날짜 고르기' });
    expect(within(strip).getAllByRole('button')).toHaveLength(7);
    expect(within(strip).getByRole('button', { name: /11월 18일 수요일/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(strip).getByRole('button', { name: /11월 16일 월요일 · 예약 3건/ })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: /11월 22일 일요일 · 휴무/ })).toBeInTheDocument();
    // 하루 시간표 = 그날 칸 하나
    expect(screen.getAllByRole('region', { name: /^11월 \d+일$/ })).toHaveLength(1);
    expect(screen.getByRole('region', { name: '11월 18일' })).toBeInTheDocument();

    await userEvent.click(within(strip).getByRole('button', { name: /11월 16일 월요일/ }));
    expect(router.state.location.search).toBe('?view=week&date=2026-11-16');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    expect(within(monday).getByRole('button', { name: /이서윤/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '11월 18일' })).not.toBeInTheDocument();
  });

  it('폰 주 보기에서 담당자가 2명이면 하루 시간표 머리에 담당자별 칸 이름', async () => {
    setTestWidth(390);
    renderAt(
      '/calendar?date=2026-11-18',
      createMemoryCalendarApi({
        staff: [{ id: 's1', name: '원장' }, { id: 's2', name: '보조' }],
        appointments: [appt({ id: 'p1', customerName: '손님가', staffId: 's1' }), appt({ id: 'p2', customerName: '손님나', staffId: 's2' })],
        blocks: [],
      }),
    );
    const wed = await screen.findByRole('region', { name: '11월 18일' });
    expect(screen.getByRole('columnheader')).toHaveTextContent('원장보조');
    const a = within(wed).getByRole('button', { name: /손님가/ });
    const b = within(wed).getByRole('button', { name: /손님나/ });
    expect(a.style.left).not.toBe(b.style.left);
  });

  it('폰 월 보기: 칸엔 예약 수만, 날을 누르면 아래에 그날 목록, 누르면 예약 보기', async () => {
    setTestWidth(390);
    const router = renderAt('/calendar?view=month&date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    const cell = within(monday).getByRole('button', { name: '16일 · 예약 3건' });
    expect(cell).toHaveTextContent('3');
    expect(within(monday).queryByText(/이서윤/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '11월 22일' })).getByRole('button', { name: '22일 · 휴무' })).toBeInTheDocument();

    await userEvent.click(cell);
    expect(router.state.location.search).toBe('?view=month&date=2026-11-16');
    const list = await screen.findByRole('region', { name: '11/16(월) 예약' });
    expect(within(list).getByText('예약 03')).toBeInTheDocument();
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('10:00김하늘'),
      expect.stringContaining('14:00이서윤'),
      expect.stringContaining('16:00박지민'),
    ]);
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('완료');
    await userEvent.click(within(list).getByRole('button', { name: /이서윤/ }));
    expect(await screen.findByRole('dialog', { name: '이서윤' })).toBeInTheDocument();
  });

  it('폰 월 보기: 관리 불가와 겹치는 예약에만 겹침을 표시한다', async () => {
    setTestWidth(390);
    const data = seedCalendar('2026-11-18');
    data.appointments.push(appt({ id: 'after-block', customerName: '합성 고객', startAt: '2026-11-20T08:00:00Z' }));
    renderAt('/calendar?view=month&date=2026-11-18', createMemoryCalendarApi(data));

    const friday = await screen.findByRole('region', { name: '11월 20일' });
    await userEvent.click(within(friday).getByRole('button', { name: /20일 · 예약/ }));
    const list = await screen.findByRole('region', { name: '11/20(금) 예약' });
    expect(within(list).getByRole('button', { name: /한예린/ })).toHaveTextContent('겹침');
    expect(within(list).getByRole('button', { name: /합성 고객/ })).not.toHaveTextContent('겹침');
  });

  it('웹 월 보기: 날마다 3건까지 이름, 넘치면 "+N"', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      appt({ id: `m${i}`, customerName: `손님${i}`, startAt: `2026-11-18T0${i}:00:00Z`, prepMin: 0, durationMin: 30 }),
    );
    renderAt('/calendar?view=month&date=2026-11-18', createMemoryCalendarApi({ staff: [{ id: 's1', name: '원장' }], appointments: many, blocks: [] }));
    const wed = await screen.findByRole('region', { name: '11월 18일' });
    expect(within(wed).getAllByRole('button')).toHaveLength(3);
    expect(within(wed).getByText('+2')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '날짜 고르기' })).not.toBeInTheDocument();
  });
});

describe('예약 보기 W2 — 웹 오른쪽 패널 / 폰 아래 시트 (캘린더 PR 2b)', () => {
  it('웹: 패널이 열려도 격자는 남아 있고(모달 아님), Esc로 닫히면 누른 예약 칸으로 초점이 돌아온다', async () => {
    renderAt('/calendar?date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    const card = within(monday).getByRole('button', { name: /이서윤/ });
    await userEvent.click(card);
    const panel = await screen.findByRole('dialog', { name: '이서윤' });
    expect(panel).not.toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('region', { name: '11월 16일' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '이서윤' })).not.toBeInTheDocument());
    await waitFor(() => expect(card).toHaveFocus());
  });

  it('예정 예약: 완료·노쇼·문자 보내기·더보기 자리, 꺼짐 + 설명 / 겹친 예약은 빨간 알림', async () => {
    renderAt('/calendar?date=2026-11-18');
    const friday = await screen.findByRole('region', { name: '11월 20일' });
    await userEvent.click(within(friday).getByRole('button', { name: /한예린/ }));
    const panel = await screen.findByRole('dialog', { name: '한예린' });
    for (const name of ['완료', '노쇼', '문자 보내기', '더보기']) {
      expect(within(panel).getByRole('button', { name })).toBeDisabled();
    }
    expect(panel).toHaveTextContent('예약 상태 바꾸기는 예약 저장 기능과 함께 열려요.');
    expect(panel).toHaveTextContent('관리 불가 시간(14:00–16:00 원장 외출)과 겹쳐요. 예약은 그대로 있어요.');
  });

  it('완료된 예약은 "상태 고치기" 하나', async () => {
    renderAt('/calendar?date=2026-11-18');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    await userEvent.click(within(monday).getByRole('button', { name: /김하늘/ }));
    const panel = await screen.findByRole('dialog', { name: '김하늘' });
    expect(within(panel).getByRole('button', { name: '상태 고치기' })).toBeDisabled();
    expect(within(panel).queryByRole('button', { name: '완료' })).not.toBeInTheDocument();
    // 완료 배지는 positive(초록) — 설계서 §7·§9.3(캡처의 회색과 다르면 설계서를 따른다)
    expect(within(panel).getByText('완료').closest('[class*="seed-badge__root"]')?.className).toMatch(/tone_positive/);
  });

  it('폰: 같은 내용이 아래 시트로 열리고, "+ 예약"은 떠 있는 버튼 자리', async () => {
    setTestWidth(390);
    renderAt('/calendar?date=2026-11-16');
    const monday = await screen.findByRole('region', { name: '11월 16일' });
    expect(screen.getByRole('button', { name: '+ 예약' })).toBeDisabled(); // 시트가 열리면 뒤 화면은 가려지므로 먼저 확인
    await userEvent.click(within(monday).getByRole('button', { name: /이서윤/ }));
    const sheet = await screen.findByRole('dialog', { name: '이서윤' });
    expect(sheet).toHaveTextContent('준비 20분 · 13:40부터 일정이 잡혀요');
  });
});
