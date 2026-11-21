import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState } from '@/components/states/DataState';
import { SessionLoaderProvider } from '@/features/auth/session';
import { FALLBACK_SHOP_NAME, ShopNameLoaderProvider, type ShopNameLoader } from '@/features/shop/shopName';
import { routes } from '@/routes';

// 웹셸은 로그인한 뒤의 화면이다 — 로그인 상태는 합성 매장으로 채운다(로그인 자체는 auth.test.tsx).
async function renderAt(path: string, shopName: ShopNameLoader = async () => '합성 매장') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionLoaderProvider value={async () => ({ shopId: 'shop-1' })}>
      <ShopNameLoaderProvider value={shopName}>
        <RouterProvider router={router} />
      </ShopNameLoaderProvider>
    </SessionLoaderProvider>,
  );
  await screen.findByRole('navigation', { name: '주 메뉴' });
  return router;
}

describe('웹셸 내비게이션', () => {
  it('주 메뉴에 캘린더·고객·설정 3개가 있다 (매출은 M1 범위 밖)', async () => {
    await renderAt('/customers');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(links).toEqual(['캘린더', '고객', '설정']);
  });

  it('첫 주소(/)는 캘린더로 보낸다', async () => {
    const router = await renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: '캘린더' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/calendar');
  });

  it('메뉴를 누르면 해당 화면으로 바뀌고 현재 메뉴가 표시된다', async () => {
    const router = await renderAt('/calendar');
    await userEvent.click(screen.getByRole('link', { name: '고객' }));
    expect(router.state.location.pathname).toBe('/customers');
    expect(screen.getByRole('heading', { level: 1, name: '고객' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '고객' })).toHaveAttribute('aria-current', 'page');
  });

  it('머리줄에 Beautiful Voice와 로그인한 매장 이름이 보인다(설계서 §3.1, 이름은 11/21 옵마 결정)', async () => {
    const loader = vi.fn(async (shopId: string) => (shopId === 'shop-1' ? '합성 매장' : '다른 매장'));
    await renderAt('/calendar', loader);
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('Beautiful Voice');
    expect(await within(header).findByLabelText('매장')).toHaveTextContent('합성 매장');
    expect(loader).toHaveBeenCalledWith('shop-1');
  });

  it('매장 이름을 못 받아도 화면은 그대로, 자리 글자를 보인다', async () => {
    await renderAt('/calendar', async () => {
      throw new Error('SHOP_503');
    });
    expect(screen.getByLabelText('매장')).toHaveTextContent(FALLBACK_SHOP_NAME);
    expect(await screen.findByRole('heading', { level: 1, name: '캘린더' })).toBeInTheDocument();
  });

  it('없는 주소는 안내를 보여 준다', async () => {
    await renderAt('/nope');
    expect(screen.getByText('없는 화면이에요')).toBeInTheDocument();
  });
});

describe('데이터 없음 / 불러오기 실패 구분', () => {
  it('데이터 없음은 경고가 아니다', () => {
    render(<EmptyState title="아직 고객이 없어요" />);
    expect(screen.getByText('아직 고객이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('불러오기 실패는 경고로 알리고 다시 시도할 수 있다', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
