// 개발용 합성 데이터. 실제 고객이 아니다(절대 규칙 8) — 전화번호는 모두 010-0000-xxxx.
// ASSUMPTION: PM 가짜 데이터([P2] 4. 데이터 §5, 11/19 전달 예정)가 오면 같은 형식으로 바꾼다.
import { SCENE_CUSTOMERS } from '@/features/calendar/mockData';
import type { MemorySeed } from './api';

const DAY = 86_400_000;
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour - 9, 0, 0, 0); // 서울 시각 hour시
  return d.toISOString();
};

export function seedCustomers(): MemorySeed {
  return {
    customers: [
      { id: 'c1', name: '김하늘', phone: '01000000001', memo: '민감성 피부' },
      { id: 'c2', name: '김하늘', phone: '01000000002', memo: null },
      { id: 'c3', name: '이서윤', phone: '01000000003', memo: '임산부 — 복부 관리 제외', birthdate: '1992-07-15', address: '합성시 가상구' },
      { id: 'c4', name: '박지민', phone: null, memo: null },
    ],
    visits: {
      c1: [
        { id: 'v1', startsAt: at(-21, 11), menu: '수분 관리', status: 'completed' },
        { id: 'v2', startsAt: at(-14, 11), menu: '수분 관리', status: 'no_show' },
        { id: 'v3', startsAt: at(-10, 11), menu: '수분 관리', status: 'cancelled' },
        { id: 'v4', startsAt: at(-7, 11), menu: '수분 관리', status: 'completed' },
        { id: 'v5', startsAt: at(1, 16), menu: '수분 관리', status: 'voided' },
        { id: 'v6', startsAt: at(3, 15), menu: '수분 관리', status: 'scheduled' },
      ],
      c3: [{ id: 'v7', startsAt: at(-3, 14), menu: '등 관리', status: 'completed' }],
    },
  };
}

/** 개발 서버 기본 데이터: 위 고객 + 캘린더 디자인 장면의 고객(같은 id, 예약 넣기 W3 검색에 나온다). */
export function seedCustomersWithScene(): MemorySeed {
  const base = seedCustomers();
  return { ...base, customers: [...base.customers, ...SCENE_CUSTOMERS.map((c) => ({ ...c }))] };
}
