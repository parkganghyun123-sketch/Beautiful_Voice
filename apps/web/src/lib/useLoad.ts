// 화면 데이터 불러오기: 로딩 / 실패 / 성공을 나눠 돌려준다. 실패는 ErrorState, 빈 결과는 EmptyState로(CAL-8).
import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T };

/**
 * load가 바뀌면 다시 불러온다 — 호출 측은 useCallback으로 감싸서 넘긴다.
 *
 * reload()로 같은 데이터를 다시 불러올 때는 받아 둔 데이터를 그대로 보여 주다가 새 데이터로 바꾼다(#59 리뷰).
 * 로딩으로 되돌리면 화면이 깜빡이고, 그 아래 부품이 새로 만들어지면서 저장 결과 안내("이미 지워진 항목이에요" 등)가 사라진다.
 * load 자체가 바뀌면(다른 고객 등) 다른 데이터이므로 로딩부터 보인다.
 */
export function useLoad<T>(load: () => Promise<T>): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<typeof load | null>(null);

  useEffect(() => {
    let alive = true;
    const sameData = loaded.current === load;
    loaded.current = load;
    setState((s) => (sameData && s.status === 'ok' ? s : { status: 'loading' }));
    load().then(
      (data) => alive && setState({ status: 'ok', data }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, reload };
}
