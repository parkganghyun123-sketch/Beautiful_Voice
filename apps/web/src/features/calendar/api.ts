// 캘린더 화면이 데이터를 가져오고 쓰는 창구. 화면은 이 인터페이스만 알고, 예약 API(BEA-176)·설정 API(#45)가 생기면 구현만 바꾼다.
// 저장 검사는 서버와 같은 @bv/scheduling 규칙(checkBooking·changeStatus)을 쓴다 — 웹·음성 같은 규칙(절대 규칙 4).
import { changeStatus } from '@bv/scheduling/appointment-status';
import {
  checkBooking,
  occupiedOf,
  type ActiveBlock,
  type BookingReject,
  type ExistingBooking,
  type ShopHours,
} from '@bv/scheduling/booking';
import { createContext, useContext } from 'react';
import { seedDesignScene, SCENE_MENUS } from './mockData';
import { dayStart, type AppointmentStatus, type CalendarAppointment, type CalendarBlock, type CalendarData, type Menu } from './model';

/** 가짜 저장소에 넣는 값. 영업시간·휴무를 빼면 "안 넣은 매장"으로 본다. */
export type CalendarSeed = Omit<CalendarData, 'businessHours' | 'closures'> & Partial<Pick<CalendarData, 'businessHours' | 'closures'>>;

/** 예약 넣기(W3) 입력. 시각은 UTC ISO. */
export interface NewAppointment {
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  menuName: string | null;
  staffId: string;
  startAt: string;
  durationMin: number;
  prepMin: number;
  memo: string | null;
}

/** 관리 불가 시간 넣기(W4) 입력. */
export type NewBlock = Omit<CalendarBlock, 'id'>;

/** 저장 결과. 거부면 이유와 걸린 예약·차단 id(문구에 쓴다, W3 거부 표). */
export type SaveResult<T> = { ok: true; value: T } | { ok: false; reason: BookingReject | 'INVALID_TRANSITION'; conflictingIds: string[] };

export interface CalendarApi {
  /** 매장 날짜 from ~ to(마지막 날 포함). 즉 from 0시 ~ to 다음 날 0시 사이에 점유·차단이 걸치는 것. 예약 API 계약도 같은 뜻으로 둔다. */
  range(from: string, to: string): Promise<CalendarData>;
  menus(): Promise<Menu[]>;
  createAppointment(input: NewAppointment): Promise<SaveResult<CalendarAppointment>>;
  /** 상태 바꾸기·고치기(W2, 결정 S5). 취소를 되살리면 겹침을 다시 검사한다. */
  setStatus(id: string, to: AppointmentStatus): Promise<SaveResult<CalendarAppointment>>;
  /** 관리 불가 시간은 기존 예약을 막지 않는다(결정 R50). start < end만 검사. */
  createBlock(input: NewBlock): Promise<CalendarBlock>;
}

/** 캘린더 데이터 → @bv/scheduling 검사 입력. */
export function toBookingInputs(data: Pick<CalendarData, 'appointments' | 'blocks' | 'businessHours' | 'closures'>): {
  hours: ShopHours;
  existing: ExistingBooking[];
  blocks: ActiveBlock[];
} {
  return {
    // 계약(#42)의 영업시간 키는 '1'~'7' 문자열, 검사 함수는 1~7 — 자바스크립트 객체 키는 같은 문자열이다.
    hours: { businessHours: data.businessHours as ShopHours['businessHours'], closures: data.closures as ShopHours['closures'] },
    existing: data.appointments.map((a) => ({
      id: a.id,
      staffId: a.staffId,
      status: a.status,
      occupied: occupiedOf({ start: new Date(a.startAt), durationMin: a.durationMin, prepMin: a.prepMin }),
    })),
    blocks: data.blocks.map((b) => ({
      id: b.id,
      start: new Date(b.startAt),
      end: new Date(b.endAt),
      allStaff: b.allStaff,
      staffIds: b.staffIds,
    })),
  };
}

/**
 * 서버 API 전 임시 저장소(브라우저 메모리). 새로고침하면 처음 값으로 돌아간다.
 * ASSUMPTION: 한 매장 데이터만 담는다. 매장 격리(shop_id)는 실제 API가 로그인 정보로 보장한다.
 */
export function createMemoryCalendarApi(seed: CalendarSeed = seedDesignScene(), menus: readonly Menu[] = SCENE_MENUS): CalendarApi {
  const store = {
    staff: seed.staff.map((s) => ({ ...s })),
    appointments: seed.appointments.map((a) => ({ ...a })),
    blocks: seed.blocks.map((b) => ({ ...b, staffIds: [...b.staffIds] })),
    businessHours: seed.businessHours ?? null,
    closures: (seed.closures ?? []).map((c) => ({ ...c })),
  };
  let next = 1;
  const check = (
    a: Pick<CalendarAppointment, 'staffId' | 'startAt' | 'durationMin' | 'prepMin'>,
    excludeId?: string,
    skipHoursCheck = false,
  ) => {
    const { hours, existing, blocks } = toBookingInputs(store);
    return checkBooking(
      { staffId: a.staffId, start: new Date(a.startAt), durationMin: a.durationMin, prepMin: a.prepMin },
      hours,
      existing,
      blocks,
      { excludeId, skipHoursCheck },
    );
  };

  return {
    async range(from, to) {
      const f = dayStart(from);
      const t = dayStart(to) + 86_400_000;
      const hit = (s: number, e: number) => s < t && e > f;
      return {
        staff: store.staff.map((s) => ({ ...s })),
        appointments: store.appointments
          .filter((a) => {
            const start = Date.parse(a.startAt);
            return hit(start - a.prepMin * 60_000, start + a.durationMin * 60_000);
          })
          .map((a) => ({ ...a })),
        blocks: store.blocks.filter((b) => hit(Date.parse(b.startAt), Date.parse(b.endAt))).map((b) => ({ ...b })),
        businessHours: store.businessHours,
        closures: store.closures.map((c) => ({ ...c })),
      };
    },
    async menus() {
      return menus.map((m) => ({ ...m }));
    },
    async createAppointment(input) {
      const r = check(input);
      if (!r.ok) return r;
      const created: CalendarAppointment = { id: `n${next++}`, ...input, status: 'scheduled' };
      store.appointments.push(created);
      return { ok: true, value: { ...created } };
    },
    async setStatus(id, to) {
      const a = store.appointments.find((x) => x.id === id);
      if (!a) throw new Error('APPOINTMENT_NOT_FOUND');
      const change = changeStatus(a.status, to, { undoOfTask: false });
      if (!change.ok) return { ok: false, reason: 'INVALID_TRANSITION', conflictingIds: [] };
      if (change.needsOverlapCheck) {
        // 상태 고치기는 시각을 바꾸지 않으므로 영업시간은 다시 보지 않고 겹침·차단만 본다.
        const r = check(a, a.id, true);
        if (!r.ok) return r;
      }
      a.status = to;
      return { ok: true, value: { ...a } };
    },
    async createBlock(input) {
      if (!(Date.parse(input.startAt) < Date.parse(input.endAt))) throw new Error('INVALID_PERIOD');
      const created: CalendarBlock = { id: `nb${next++}`, ...input, staffIds: [...input.staffIds] };
      store.blocks.push(created);
      return { ...created };
    },
  };
}

const CalendarApiContext = createContext<CalendarApi | null>(null);
export const CalendarApiProvider = CalendarApiContext.Provider;

const defaultApi = createMemoryCalendarApi();
export function useCalendarApi(): CalendarApi {
  return useContext(CalendarApiContext) ?? defaultApi;
}
