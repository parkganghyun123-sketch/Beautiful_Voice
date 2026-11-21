// 설정 첫 화면(W13, BEA-166·167): 항목 목록 → 누르면 항목별 화면. SEED 부품으로 만든다(ADR-0008).
// ASSUMPTION(해나 11/21 결정): 한 화면에 다 펼치지 않고 목록 → 하위 화면. M1 밖 항목(AI 반영 방식·문자 양식·내 정보)은 같은 목록에 나중에 붙인다.
// 설정은 사람만 바꾼다. AI 실행기에는 설정 쓰기 권한이 없다(결정 R0).
import { List } from '@seed-design/react';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { shopToday } from '@/features/customers/model';
import { useSettingsApi } from '@/features/settings/api';
import { closuresSummary } from '@/features/settings/closures';
import { hoursSummary } from '@/features/settings/hours';
import { useLoad } from '@/lib/useLoad';

interface Entry {
  title: string;
  /** 없으면 아직 만들지 않은 화면 — 누를 수 없고 "준비 중"으로 보인다. */
  to?: string;
  detail?: string;
}

export function SettingsPage() {
  const api = useSettingsApi();
  const load = useCallback(() => Promise.all([api.getBusinessHours(), api.listClosures()]), [api]);
  const { state } = useLoad(load);
  // 요약을 못 불러와도 목록은 보인다 — 들어가서 다시 불러올 수 있다.
  const [hours, closures] = state.status === 'ok' ? state.data : [];
  const hoursDetail = state.status === 'ok' ? hoursSummary(hours ?? null) : undefined;
  const closuresDetail = closures ? closuresSummary(closures, shopToday()) : undefined;

  const entries: Entry[] = [
    { title: '영업시간', to: '/settings/hours', detail: hoursDetail },
    { title: '휴무·휴가', to: '/settings/closures', detail: closuresDetail },
    { title: '메뉴' },
    { title: '담당자' },
  ];

  return (
    <div className="flex flex-col gap-2 pt-6 md:max-w-lg">
      <h1 className="px-4 text-xl font-semibold text-ink">설정</h1>
      <List.Root aria-label="설정 항목">
        {entries.map((e) => (
          <li key={e.title}>
            {e.to ? (
              <List.Item asChild>
                <Link to={e.to}>
                  <List.Content>
                    <List.Title>{e.title}</List.Title>
                  </List.Content>
                  <List.Suffix>
                    {e.detail && <span>{e.detail}</span>}
                    <span aria-hidden>›</span>
                  </List.Suffix>
                </Link>
              </List.Item>
            ) : (
              <List.Item asChild aria-disabled="true">
                <div>
                  <List.Content>
                    <List.Title className="text-ink-soft">{e.title}</List.Title>
                  </List.Content>
                  <List.Suffix>준비 중</List.Suffix>
                </div>
              </List.Item>
            )}
          </li>
        ))}
      </List.Root>
    </div>
  );
}
