// 캘린더 조각 모양(화면 설계서 §9.4). 색은 tokens.css의 --cal-* 역할만 쓴다(ADR-0008).
// 색만으로 구분하지 않도록 관리는 면, 준비는 보라 빗금, 관리 불가는 회색 빗금 + 글자를 함께 쓴다.
import type { AppointmentStatus } from '@/features/calendar/model';

export const KIND_CLASS = {
  care: 'bg-cal-appt text-cal-appt-text',
  prep: 'bg-cal-prep bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--cal-prep-stripe)_4px_6px)]',
  block: 'bg-cal-block bg-[repeating-linear-gradient(45deg,transparent_0_6px,var(--cal-block-stripe)_6px_8px)] text-ink-soft',
  closed: 'bg-cal-closed',
} as const;

/** 상태별 예약 칸(설계서 W1·캡처): 완료는 옅게, 노쇼는 빨강. 예정은 기본 관리 색. */
export const STATUS_CLASS: Partial<Record<AppointmentStatus, string>> = {
  completed: 'bg-cal-done text-cal-done-text',
  no_show: 'bg-cal-noshow text-cal-noshow-text',
};

/** 상태 배지 톤(설계서 §7·§9.3: positive = 됐다 → 완료, critical = 노쇼). 캡처의 회색과 다르면 설계서를 따른다(11/21 옵마). 칸 바탕의 옅은 완료 색은 캡처대로. */
export const STATUS_TONE: Partial<Record<AppointmentStatus, 'positive' | 'critical'>> = {
  completed: 'positive',
  no_show: 'critical',
};
