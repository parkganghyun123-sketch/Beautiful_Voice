// useLoad: 같은 데이터를 다시 불러올 때는 받아 둔 것을 유지하고, 다른 데이터(load가 바뀜)면 로딩부터(#59 리뷰).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLoad } from '@/lib/useLoad';

/** 부를 때마다 끝내기를 손으로 정하는 load. */
function manual<T>() {
  const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const load = () => new Promise<T>((resolve, reject) => pending.push({ resolve, reject }));
  return { load, last: () => pending[pending.length - 1]! };
}

describe('useLoad', () => {
  it('reload 중에는 받아 둔 데이터를 그대로 보여 주고, 새 데이터가 오면 바꾼다', async () => {
    const m = manual<string>();
    const { result } = renderHook(() => useLoad(m.load));
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => m.last().resolve('처음'));
    expect(result.current.state).toEqual({ status: 'ok', data: '처음' });

    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: 'ok', data: '처음' });
    await act(async () => m.last().resolve('다시'));
    expect(result.current.state).toEqual({ status: 'ok', data: '다시' });
  });

  it('load가 바뀌면(다른 데이터) 이전 데이터를 보이지 않고 로딩부터', async () => {
    const a = manual<string>();
    const b = manual<string>();
    const { result, rerender } = renderHook(({ load }) => useLoad(load), { initialProps: { load: a.load } });
    await act(async () => a.last().resolve('고객 A'));
    rerender({ load: b.load });
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => b.last().resolve('고객 B'));
    expect(result.current.state).toEqual({ status: 'ok', data: '고객 B' });
  });

  it('실패 뒤 다시 시도는 로딩부터, reload가 실패하면 실패로 보인다', async () => {
    const m = manual<string>();
    const { result } = renderHook(() => useLoad(m.load));
    await act(async () => m.last().reject(new Error('offline')));
    expect(result.current.state).toEqual({ status: 'error' });
    act(() => result.current.reload());
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => m.last().resolve('됨'));

    act(() => result.current.reload());
    await act(async () => m.last().reject(new Error('offline')));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });
});
