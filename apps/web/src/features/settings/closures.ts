// 휴무·휴가 화면이 쓰는 묶기·문구. 화면은 날짜 휴무(holiday·vacation)만 다루고, 매주 휴무(weekly)는 영업시간의 정기 휴무가 정한다(W13 디자인).
import type { Closure, ClosureInput } from '@bv/contracts';

export type ClosureKind = Closure['kind'];

/** 날짜 휴무의 종류 이름(배지). 저장 값 이름(holiday 등)은 보이지 않는다(디자인 정책). 매주 휴무는 영업시간의 "정기 휴무". */
export const KIND_TEXT: Record<'holiday' | 'vacation', string> = { holiday: '공휴일', vacation: '휴가' };

export interface ClosureGroups {
  weekly: Closure[];
  /** 오늘(매장 날짜) 또는 그 뒤에 끝나는 날짜 휴무, 시작일 순. */
  upcoming: Closure[];
  /** 이미 끝난 날짜 휴무, 최근 것부터. 화면에서는 접어 둔다. */
  past: Closure[];
}

const startOf = (c: Closure) => (c.kind === 'weekly' ? '' : c.startDate);

/** @param today 매장 시간대의 오늘 "YYYY-MM-DD"(절대 규칙 7). */
export function groupClosures(closures: readonly Closure[], today: string): ClosureGroups {
  const weekly = closures.filter((c) => c.kind === 'weekly').sort((a, b) => (a.kind === 'weekly' && b.kind === 'weekly' ? a.weekday - b.weekday : 0));
  const dated = closures.filter((c): c is Extract<Closure, { endDate: string }> => c.kind !== 'weekly');
  const upcoming = dated.filter((c) => c.endDate >= today).sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const past = dated.filter((c) => c.endDate < today).sort((a, b) => startOf(b).localeCompare(startOf(a)));
  return { weekly, upcoming, past };
}

/** 설정 목록 요약(W13 디자인): 가장 가까운 날짜 휴무 하나. 예: "다음 휴가 12/24–12/26", "다음 공휴일 12/25", "없음". 매주 휴무는 영업시간 쪽 요약. */
export function closuresSummary(closures: readonly Closure[], today: string): string {
  const [next] = groupClosures(closures, today).upcoming;
  if (!next || next.kind === 'weekly') return '없음';
  const md = (ymd: string) => ymd.slice(5).replace('-', '/').replace(/^0/u, '').replace(/\/0/u, '/');
  const range = next.startDate === next.endDate ? md(next.startDate) : `${md(next.startDate)}–${md(next.endDate)}`;
  return `다음 ${KIND_TEXT[next.kind]} ${range}`;
}

/**
 * 방금 추가·지운 휴무. 서버 목록을 다시 불러오기 전에도 화면에 반영한다(#59·#60 리뷰) —
 * 느린 목록 갱신 중에 같은 요일을 또 추가하거나, 지운 줄을 또 누르지 않게.
 * base가 바뀌면(새 목록 도착) 비운다: 새 목록에 이미 들어 있다.
 */
export interface LocalChanges {
  base: readonly Closure[];
  added: Closure[];
  removed: string[];
}

export const noLocalChanges = (base: readonly Closure[]): LocalChanges => ({ base, added: [], removed: [] });

/** 서버 목록 + 방금 바뀐 것. 같은 id는 한 번만(같은 키로 다시 보내 같은 휴무가 돌아온 경우). */
export function withLocalChanges(closures: readonly Closure[], local: LocalChanges): Closure[] {
  const mine = local.base === closures ? local : noLocalChanges(closures);
  const ids = new Set(closures.map((c) => c.id));
  return [...closures, ...mine.added.filter((a) => !ids.has(a.id))].filter((c) => !mine.removed.includes(c.id));
}

/** 휴무 추가 시트의 입력(날짜 휴무만 — 매주 휴무는 영업시간 화면). 끝나는 날을 비우면 하루짜리(시작일과 같음). */
export interface ClosureDraft {
  kind: 'holiday' | 'vacation';
  startDate: string;
  endDate: string;
  note: string;
}

export function toClosureInput(d: ClosureDraft): ClosureInput {
  return { kind: d.kind, startDate: d.startDate, endDate: d.endDate || d.startDate, note: d.note.trim() || null };
}
