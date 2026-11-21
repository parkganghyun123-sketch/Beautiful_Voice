// 메뉴 화면이 쓰는 문구·값 바꾸기(BEA-167). 메뉴는 이름·기본 관리 시간·기본 준비 시간만 있다(명세 3 2A-1.3, 가격 없음).
// 기본 시간은 예약을 넣을 때 미리 채우는 값이다(명세 1 §2.2, 결정 S3).
import type { Menu } from '@bv/contracts';

/**
 * 자주 쓰는 분. 누르면 칸이 채워진다.
 * ASSUMPTION(해나 11/21 결정): 숫자 칸 + 칩. 명세·디자인 정책에 입력 방식이 없어 W13 설계서를 받으면 맞춘다.
 */
export const DURATION_CHIPS = [30, 60, 90, 120] as const;
export const PREP_CHIPS = [0, 10, 20, 30] as const;

/** 목록 한 줄의 시간 설명. 예: "관리 60분 · 준비 10분", "관리 50분", "시간 안 정함". */
export function menuTimeText(m: Pick<Menu, 'defaultDurationMin' | 'defaultPrepMin'>): string {
  const parts: string[] = [];
  if (m.defaultDurationMin !== null) parts.push(`관리 ${m.defaultDurationMin}분`);
  if (m.defaultPrepMin !== null) parts.push(`준비 ${m.defaultPrepMin}분`);
  return parts.length ? parts.join(' · ') : '시간 안 정함';
}

/** 칸 글자 → 분. 비우면 null(시간 안 정함). 숫자가 아니면 NaN을 넘겨 공용 검사가 이유와 함께 거부하게 한다. */
export function parseMinutes(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  return /^\d+$/u.test(t) ? Number(t) : Number.NaN;
}

export const minutesText = (n: number | null): string => (n === null ? '' : String(n));
