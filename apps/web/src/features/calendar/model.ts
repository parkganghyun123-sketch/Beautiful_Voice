// 캘린더 보기(BEA-175, 기능 2A-3.1)의 데이터 모양과 화면 배치 규칙. 저장·검사는 하지 않는다(그건 예약 쓰기 BEA-160·177).
// 시간은 UTC로 받고 매장 시간대로 그린다(절대 규칙 7).
// ASSUMPTION: 매장 시간대는 Asia/Seoul 고정(ADR-0007). 서울은 일광절약시간이 없어 +9시간으로 계산한다.
// 다른 시간대 매장이 생기면 SHOP_OFFSET과 함께 날짜를 다루는 weekTitle·isClosedDay·outsideHours도 점검한다.

import type { BusinessHours, Closure } from '@bv/contracts';

/** 예약 상태(명세 01 §2.2). */
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'voided';

export const STATUS_TEXT: Record<AppointmentStatus, string> = {
  scheduled: '예정', // 화면 표기 통일(주드 11/20): 상태는 '예정', 기능 문구(예약 등록·상세)는 '예약'
  completed: '완료',
  cancelled: '취소',
  no_show: '노쇼',
  voided: '되돌림',
};

/** 캘린더에 그릴 예약 한 건. 고객·메뉴·담당자는 이름까지 붙여서 받는다(카드에 보이므로). */
export interface CalendarAppointment {
  id: string;
  /** 고객 상세(W6)로 가는 연결. 없으면 이름만 보인다. */
  customerId?: string | null;
  customerName: string;
  /** 예약 보기(W2) 이름 아래 전화번호. */
  customerPhone?: string | null;
  menuName: string | null;
  staffId: string;
  /** 관리 시작(UTC ISO). */
  startAt: string;
  durationMin: number;
  /** 준비 시간 — 관리 시작 앞에 붙는다. */
  prepMin: number;
  memo: string | null;
  status: AppointmentStatus;
}

/** 캘린더 차단. allStaff면 매장 전체, 아니면 staffIds의 담당자만 막는다(명세 01 §2.2). */
export interface CalendarBlock {
  id: string;
  startAt: string;
  endAt: string;
  allStaff: boolean;
  staffIds: string[];
  memo: string | null;
}

export interface Staff {
  id: string;
  name: string;
}

/** 메뉴(설정 2A-1). 예약 넣기(W3)에서 칩을 고르면 관리·준비 시간이 채워진다(결정 S3). */
export interface Menu {
  id: string;
  name: string;
  durationMin: number;
  prepMin: number;
}

export interface CalendarData {
  staff: Staff[];
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  /** 매장 영업시간(계약 #42 settings/business-hours). null = 아직 안 넣음 → 회색 덮기 없음. */
  businessHours: BusinessHours | null;
  /** 휴무(계약 #42 closures). 그날은 격자 전체를 회색으로 덮는다(결정 S2). */
  closures: Closure[];
}

// ── 날짜 계산(매장 날짜 'YYYY-MM-DD') ─────────────────────────────

const MIN = 60_000;
const DAY = 86_400_000;
const SHOP_OFFSET = 9 * 60 * MIN;

/** 매장 날짜 0시의 UTC 시각(ms). */
export function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - SHOP_OFFSET;
}

/** UTC 시각 → 매장 날짜. */
export function shopDate(ms: number): string {
  return new Date(ms + SHOP_OFFSET).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 0=월 … 6=일. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** ASSUMPTION: 주는 월요일에 시작한다 — 와이어프레임(11/21)에서 확인. */
export function weekDays(date: string): string[] {
  const monday = addDays(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 달력 칸: 그 달 1일이 든 주 월요일부터 말일이 든 주 일요일까지. */
export function monthGrid(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const next = addDays(first, 32).slice(0, 7);
  const last = addDays(`${next}-01`, -1);
  const days: string[] = [];
  for (let d = weekDays(first)[0]!; d <= weekDays(last)[6]!; d = addDays(d, 1)) days.push(d);
  return days;
}

export function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
}

// ── 화면 배치 ─────────────────────────────────────────────

/** 관리(care)·준비(prep)·차단(block)을 다르게 그린다(BEA-175 완료 조건). */
export type SegmentKind = 'care' | 'prep' | 'block';

export interface Segment {
  kind: SegmentKind;
  /** 예약 id 또는 차단 id. */
  sourceId: string;
  /** 그 날 0시부터 몇 분째에서 시작·끝나는지(날을 넘으면 잘라 낸다). */
  fromMin: number;
  toMin: number;
  /** 담당자 줄. null이면 모든 담당자에 걸친다(매장 전체 차단). */
  staffId: string | null;
}

/** 캘린더에 보이는 예약: 취소·되돌림은 점유가 아니라 칸을 차지하지 않는다. */
export function isShown(a: CalendarAppointment): boolean {
  // ASSUMPTION: 취소·되돌림 예약은 캘린더에 그리지 않는다(점유에서 빠짐, 명세 01 §2.2). 고객 방문 기록에서 본다.
  return a.status !== 'cancelled' && a.status !== 'voided';
}

/** 점유 = [시작 − 준비, 시작 + 관리) (명세 01 §2.2, 결정 R33). */
export function appointmentParts(a: CalendarAppointment): { kind: 'prep' | 'care'; from: number; to: number }[] {
  const start = Date.parse(a.startAt);
  const parts: { kind: 'prep' | 'care'; from: number; to: number }[] = [];
  if (a.prepMin > 0) parts.push({ kind: 'prep', from: start - a.prepMin * MIN, to: start });
  parts.push({ kind: 'care', from: start, to: start + a.durationMin * MIN });
  return parts;
}

/** 하루치 조각. 자정을 넘는 예약·차단은 그 날 안쪽만 남긴다. */
export function segmentsForDay(date: string, data: Pick<CalendarData, 'appointments' | 'blocks'>): Segment[] {
  const d0 = dayStart(date);
  const d1 = d0 + DAY;
  const out: Segment[] = [];
  const clip = (kind: SegmentKind, sourceId: string, from: number, to: number, staffId: string | null) => {
    const f = Math.max(from, d0);
    const t = Math.min(to, d1);
    if (f < t) out.push({ kind, sourceId, fromMin: (f - d0) / MIN, toMin: (t - d0) / MIN, staffId });
  };
  for (const b of data.blocks) {
    const from = Date.parse(b.startAt);
    const to = Date.parse(b.endAt);
    if (b.allStaff) clip('block', b.id, from, to, null);
    else for (const s of b.staffIds) clip('block', b.id, from, to, s);
  }
  for (const a of data.appointments.filter(isShown)) {
    for (const p of appointmentParts(a)) clip(p.kind, a.id, p.from, p.to, a.staffId);
  }
  return out;
}

/** 주간 보기의 세로 범위(분). 기본 9~21시, 그 밖 조각이 있으면 시간 단위로 넓힌다. */
export function hourRange(segments: readonly Segment[], base: [number, number] = [9, 21]): [number, number] {
  let [from, to] = base;
  for (const s of segments) {
    from = Math.min(from, Math.floor(s.fromMin / 60));
    to = Math.max(to, Math.ceil(s.toMin / 60));
  }
  return [from, to];
}

/** 'HH:MM' (매장 시각). */
export function shopTime(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  return new Date(ms + SHOP_OFFSET).toISOString().slice(11, 16);
}

/** 예약 카드의 시간 글자: "13:40 준비 · 14:00–15:00". */
export function appointmentTimeText(a: CalendarAppointment): string {
  const start = Date.parse(a.startAt);
  const care = `${shopTime(start)}–${shopTime(start + a.durationMin * MIN)}`;
  return a.prepMin > 0 ? `${shopTime(start - a.prepMin * MIN)} 준비 · ${care}` : care;
}

// ── W1 디자인(SEED 옮기기): 제목·영업시간 밖·겹침·담당자 거르기 ─────────────

const ORDINAL = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

/**
 * 주 제목 "11월 넷째 주"(화면 설계서 W1). 그 주의 목요일이 든 달·몇째 주로 센다 — 달이 걸친 주는 목요일 쪽 달.
 * ASSUMPTION: 설계서 예시(11/23~29 = 11월 넷째 주)와 맞는 규칙. 명세에 계산법은 없다.
 */
export function weekTitle(date: string): string {
  const thursday = addDays(weekDays(date)[0]!, 3);
  const month = Number(thursday.slice(5, 7));
  return `${month}월 ${ORDINAL[Math.ceil(Number(thursday.slice(8, 10)) / 7) - 1]} 주`;
}

/** 그날이 휴무(매주 요일 휴무 또는 공휴일·휴가 기간)인가. */
export function isClosedDay(date: string, closures: readonly Closure[]): boolean {
  const weekday = weekdayIndex(date) + 1;
  return closures.some((c) => (c.kind === 'weekly' ? c.weekday === weekday : c.startDate <= date && date <= c.endDate));
}

/** 영업시간 밖 구간(그날 0시부터 분). 영업시간을 안 넣었으면 없음. 그 요일 구간이 없으면 하루 전체. */
export function outsideHours(date: string, hours: BusinessHours | null): [number, number][] {
  if (!hours) return [];
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const key = String(weekdayIndex(date) + 1) as keyof BusinessHours;
  const open = [...(hours[key] ?? [])].map((w) => [toMin(w.open), toMin(w.close)] as const).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = 0;
  for (const [o, c] of open) {
    if (o > at) out.push([at, o]);
    at = Math.max(at, c);
  }
  if (at < 24 * 60) out.push([at, 24 * 60]);
  return out;
}

/** 세로 시간 범위의 기본값: 보이는 날들의 영업시간 ±1시간(설계서 W1). 영업시간이 없으면 9~21시. */
export function hoursBase(days: readonly string[], hours: BusinessHours | null): [number, number] {
  if (!hours) return [9, 21];
  let from = 24;
  let to = 0;
  for (const d of days) {
    const key = String(weekdayIndex(d) + 1) as keyof BusinessHours;
    for (const w of hours[key] ?? []) {
      from = Math.min(from, Number(w.open.slice(0, 2)) - 1);
      to = Math.max(to, Math.ceil((Number(w.close.slice(0, 2)) * 60 + Number(w.close.slice(3, 5))) / 60) + 1);
    }
  }
  return from < to ? [Math.max(0, from), Math.min(24, to)] : [9, 21];
}

/**
 * 관리 불가 시간과 겹치는 예약인가(결정 R50: 기존 예약은 그대로 두고 캘린더에서 겹침으로 보인다).
 * 점유 [시작−준비, 시작+관리)가 그 담당자에게 걸린 차단(매장 전체 포함)과 겹치면 true.
 * 표시용이다 — 저장 거부는 서버(#36 checkBooking)·DB가 한다.
 * 후속: "캘린더 연결" PR에서 서버가 주는 blockedBy(#42)를 쓰고 이 함수와 그 테스트를 지운다.
 */
export function overlapsBlock(a: CalendarAppointment, blocks: readonly CalendarBlock[]): boolean {
  return overlappingBlocks(a, blocks).length > 0;
}

/** 이 예약과 겹치는 관리 불가 시간들(예약 패널의 겹침 알림 문구에 쓴다). */
export function overlappingBlocks(a: CalendarAppointment, blocks: readonly CalendarBlock[]): CalendarBlock[] {
  const start = Date.parse(a.startAt);
  const from = start - a.prepMin * MIN;
  const to = start + a.durationMin * MIN;
  return blocks.filter((b) => (b.allStaff || b.staffIds.includes(a.staffId)) && Date.parse(b.startAt) < to && Date.parse(b.endAt) > from);
}

const DAY_NAME = ['일', '월', '화', '수', '목', '금', '토'];

/** 예약 패널 시각 두 줄(설계서 W2): "11/24(화) 14:00–15:00 · 60분", "준비 10분 · 13:50부터 일정이 잡혀요"(준비가 있을 때). */
export function appointmentPanelTime(a: CalendarAppointment): [string, string | null] {
  const start = Date.parse(a.startAt);
  const d = shopDate(start);
  const dow = DAY_NAME[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const main = `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${dow}) ${shopTime(start)}–${shopTime(start + a.durationMin * MIN)} · ${a.durationMin}분`;
  const prep = a.prepMin > 0 ? `준비 ${a.prepMin}분 · ${shopTime(start - a.prepMin * MIN)}부터 일정이 잡혀요` : null;
  return [main, prep];
}

/** 담당자 거르기. null = 전체. 매장 전체 차단은 누구를 골라도 보인다. */
export function forStaff(data: CalendarData, staffId: string | null): CalendarData {
  if (staffId === null) return data;
  return {
    ...data,
    staff: data.staff.filter((s) => s.id === staffId),
    appointments: data.appointments.filter((a) => a.staffId === staffId),
    // 여러 담당자에게 걸린 차단은 고른 담당자 조각만 남긴다 — 안 보이는 담당자 조각이 전체 폭으로 겹쳐 그려지지 않게(#50 리뷰).
    blocks: data.blocks
      .filter((b) => b.allStaff || b.staffIds.includes(staffId))
      .map((b) => (b.allStaff ? b : { ...b, staffIds: [staffId] })),
  };
}
