// 개발용 합성 데이터. 실제 고객이 아니다(절대 규칙 8).
// 이번 주(매장 날짜 기준) 월요일을 기준으로 만들어 언제 열어도 이번 주에 예약이 보인다.
// 1인 매장(원장 1명) 기준. 담당자가 여럿인 경우는 테스트 안에서 따로 만들어 확인한다.
import type { CalendarSeed } from './api';
import { addDays, dayStart, shopDate, weekDays, type CalendarAppointment } from './model';

/** 매장 날짜 date의 hh:mm → UTC ISO. */
const at = (date: string, hh: number, mm = 0) => new Date(dayStart(date) + (hh * 60 + mm) * 60_000).toISOString();

export function seedCalendar(today: string = shopDate(Date.now())): Required<CalendarSeed> {
  const [mon] = weekDays(today) as [string];
  const d = (n: number) => addDays(mon, n);
  let n = 0;
  const appt = (
    day: number,
    hh: number,
    mm: number,
    customerName: string,
    menuName: string | null,
    staffId: string,
    durationMin: number,
    prepMin: number,
    memo: string | null = null,
    status: CalendarAppointment['status'] = 'scheduled',
  ): CalendarAppointment => ({
    id: `a${++n}`,
    customerName,
    menuName,
    staffId,
    startAt: at(d(day), hh, mm),
    durationMin,
    prepMin,
    memo,
    status,
  });

  return {
    staff: [{ id: 's1', name: '원장' }],
    appointments: [
      appt(0, 10, 0, '김하늘', '수분 관리', 's1', 60, 10, '민감성 피부 — 저자극 제품', 'completed'),
      appt(0, 14, 0, '이서윤', '등 관리', 's1', 60, 20, '임산부 — 복부 관리 제외'),
      appt(0, 16, 0, '박지민', '수분 관리', 's1', 50, 10),
      appt(1, 11, 30, '최유나', null, 's1', 90, 0, '첫 방문'),
      appt(2, 13, 0, '김하늘', '수분 관리', 's1', 60, 10, null, 'no_show'),
      appt(2, 16, 0, '정다은', '리프팅', 's1', 80, 10),
      appt(3, 10, 0, '이서윤', '등 관리', 's1', 60, 20, null, 'cancelled'),
      appt(4, 15, 0, '한예린', '수분 관리', 's1', 60, 10),
      appt(5, 20, 30, '오수아', '리프팅', 's1', 80, 10, '퇴근 후 방문'),
    ],
    blocks: [
      { id: 'b1', startAt: at(d(3), 12, 0), endAt: at(d(3), 13, 0), allStaff: true, staffIds: [], memo: '점심' },
      // 15:00 한예린 예약과 겹친다 — 기존 예약은 그대로, 캘린더에 "겹침"(결정 R50)
      { id: 'b2', startAt: at(d(4), 14, 0), endAt: at(d(4), 16, 0), allStaff: false, staffIds: ['s1'], memo: '원장 외출' },
    ],
    // 월~토 10:00~22:00, 일요일 매주 휴무(계약 #42 모양)
    businessHours: Object.fromEntries(['1', '2', '3', '4', '5', '6'].map((k) => [k, [{ open: '10:00', close: '22:00' }]])),
    closures: [{ id: 'c1', kind: 'weekly', weekday: 7, note: '정기 휴무' }],
  };
}

// ── 디자인 장면(카본 W1~W4 캡처와 같은 장면, 11/21 옵마 결정) ───────────────────────
// 개발 서버에서 보이는 기본 데이터. 이름·전화는 모두 합성(절대 규칙 8). 테스트는 위 seedCalendar를 쓴다.

/** 디자인 장면의 메뉴(관리·준비 기본 시간). */
export const SCENE_MENUS = [
  { id: 'm1', name: '수분 관리', durationMin: 60, prepMin: 10 },
  { id: 'm2', name: '리프팅 관리', durationMin: 90, prepMin: 10 },
  { id: 'm3', name: '등 관리', durationMin: 50, prepMin: 10 },
  { id: 'm4', name: '왁싱', durationMin: 60, prepMin: 10 },
] as const;

/** 디자인 장면의 고객. 고객 화면의 가짜 저장소에도 같은 id로 들어간다(features/customers/mockData). */
export const SCENE_CUSTOMERS = [
  { id: 'd1', name: '김서연', phone: '01000001001', memo: null },
  { id: 'd2', name: '최유나', phone: '01000001002', memo: null },
  { id: 'd3', name: '정다은', phone: '01000001003', memo: null },
  { id: 'd4', name: '강민지', phone: '01000001004', memo: null },
  { id: 'd5', name: '오세린', phone: '01000001005', memo: null },
] as const;

type SceneRow = [
  day: number,
  hh: number,
  mm: number,
  customer: number,
  menu: number,
  staff: 's1' | 's2',
  status?: CalendarAppointment['status'],
  memo?: string,
];

// 한 주 모양(월=0). 박원장 s1 = 왼쪽 칸, 이실장 s2 = 오른쪽 칸.
const SCENE_WEEK: SceneRow[] = [
  [0, 11, 0, 0, 0, 's1', 'completed'],
  [0, 15, 0, 2, 2, 's2', 'completed'],
  [1, 10, 0, 0, 0, 's1', 'completed'],
  [1, 11, 30, 1, 1, 's2'],
  [1, 13, 0, 2, 2, 's1', 'no_show'],
  [1, 14, 30, 3, 3, 's2'],
  [1, 16, 0, 0, 0, 's1', 'scheduled', '지난번 각질 관리 뒤 약간 붉어짐. 진정 위주로.'],
  [1, 18, 0, 4, 0, 's1'],
  [3, 10, 30, 3, 3, 's1'],
  [3, 13, 0, 0, 0, 's2'],
  [4, 11, 0, 2, 2, 's2'],
  [4, 12, 0, 1, 1, 's1'],
  [4, 15, 0, 4, 0, 's1'],
  [5, 10, 0, 0, 0, 's1'],
  [5, 11, 30, 2, 1, 's1'],
  [5, 14, 0, 3, 3, 's2'],
  [5, 16, 0, 1, 1, 's2'],
  [6, 13, 0, 4, 0, 's1'],
];

export function seedDesignScene(today: string = shopDate(Date.now())): Required<CalendarSeed> {
  const [mon] = weekDays(today) as [string];
  const appointments: CalendarAppointment[] = [];
  // 이번 주 앞뒤 4주에 같은 모양을 깔아 월 보기에도 날마다 예약 수가 보이게 한다. 지난 주는 완료.
  for (let w = -4; w <= 4; w++) {
    SCENE_WEEK.forEach(([day, hh, mm, c, m, staffId, status = 'scheduled', memo], i) => {
      if (w !== 0 && i % 3 === 2) return; // 다른 주는 조금 덜 차게
      const customer = SCENE_CUSTOMERS[c]!;
      const menu = SCENE_MENUS[m]!;
      appointments.push({
        id: `w${w}-${i}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        menuName: menu.name,
        staffId,
        startAt: at(addDays(mon, w * 7 + day), hh, mm),
        durationMin: menu.durationMin,
        prepMin: menu.prepMin,
        memo: memo ?? null,
        status: w < 0 ? 'completed' : w > 0 ? 'scheduled' : status,
      });
    });
  }
  return {
    staff: [
      { id: 's1', name: '박원장' },
      { id: 's2', name: '이실장' },
    ],
    appointments,
    blocks: [
      // 이실장 외부 교육 — 14:30 강민지 왁싱과 겹친다(결정 R50: 예약은 그대로, 캘린더에 "겹침")
      {
        id: 'b1',
        startAt: at(addDays(mon, 1), 14, 0),
        endAt: at(addDays(mon, 1), 16, 0),
        allStaff: false,
        staffIds: ['s2'],
        memo: '외부 교육',
      },
      { id: 'b2', startAt: at(addDays(mon, 3), 17, 0), endAt: at(addDays(mon, 3), 18, 0), allStaff: true, staffIds: [], memo: '직원 회의' },
    ],
    // 월·화·목·금·토 10~20시, 일 11~17시, 수요일 정기 휴무
    businessHours: {
      ...Object.fromEntries(['1', '2', '4', '5', '6'].map((k) => [k, [{ open: '10:00', close: '20:00' }]])),
      '7': [{ open: '11:00', close: '17:00' }],
    },
    closures: [{ id: 'c1', kind: 'weekly', weekday: 3, note: '정기 휴무' }],
  };
}
