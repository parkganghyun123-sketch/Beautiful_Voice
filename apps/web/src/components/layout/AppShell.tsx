// 웹셸: 모든 화면이 공유하는 틀 (P2-01, 화면 설계서 §3.1, ADR-0008 SEED). 값은 디자인 HTML(.w-top·.w-tabs·.tabbar).
// 웹(768px 이상): 64px 머리줄 — 왼쪽 브랜드, 매장 이름, 탭. 폰: 머리줄 없이 아래 탭 바(아이콘 + 글자).
// 폰에서 매장 이름은 각 화면 제목 위에 둔다(디자인 .p-shop) — 화면이 useShopName()으로 받는다.
// 색은 tokens.css 역할(bg-paper, text-ink-soft, text-brand-text …)만, 배치는 Tailwind만 쓴다.
import { CalendarDays, Settings, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router';
import { BRAND_NAME } from '@/brand';
import { useSession } from '@/features/auth/session';
import { FALLBACK_SHOP_NAME, useShopNameLoader } from '@/features/shop/shopName';
import { cn } from '@/lib/utils';

// 메뉴: M1은 캘린더·고객·설정. 승인함은 M2에서 나타난다(§3.1, 2F-B7). 매출은 어느 모듈에도 없다(명세 3 §1).
export const NAV_ITEMS = [
  { to: '/calendar', label: '캘린더', icon: CalendarDays },
  { to: '/customers', label: '고객', icon: Users },
  { to: '/settings', label: '설정', icon: Settings },
] as const;

interface ShellContext {
  shopName: string;
}

export function AppShell() {
  const shopName = useLoadedShopName();
  // 폰·웹을 JS로 갈라 그리지 않는다 — 너비 판정이 처음 한 번 바뀔 때 탭이 새로 그려지며 초점·누름이 끊기지 않게. 배치는 CSS(md:)로.
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="md:sticky md:top-0 md:z-30 md:border-b md:border-line md:bg-paper">
        <div className="mx-auto max-w-[1280px] items-center gap-[18px] px-6 md:flex md:h-16">
          <BrandLockup />
          {/* 매장 전환 자리(§3.1). M1은 매장이 하나라 표시만 한다. 폰은 각 화면 제목 위에 둔다. */}
          <p
            aria-label="매장"
            className="hidden h-9 shrink-0 items-center rounded-[10px] bg-neutral-weak px-2.5 text-[15px] font-bold md:inline-flex"
          >
            {shopName}
          </p>
          {/* 폰: 아래 탭 바(아이콘 + 글자) / 웹: 머리줄 탭 */}
          <nav
            aria-label="주 메뉴"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[max(14px,env(safe-area-inset-bottom))] md:static md:ml-2 md:h-full md:border-t-0 md:pb-0"
          >
            <ul className="grid grid-cols-3 md:flex md:h-full md:gap-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <li key={to} className="md:h-full">
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-col items-center gap-0.5 pt-[9px] pb-1 text-sm font-semibold text-ink-soft',
                        'md:h-full md:flex-row md:px-3.5 md:py-0 md:text-base md:font-bold',
                        isActive && 'text-brand-text md:text-ink md:shadow-[inset_0_-2px_0_var(--brand)]',
                      )
                    }
                  >
                    <Icon aria-hidden size={24} strokeWidth={1.75} className="md:hidden" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] pb-[76px] md:pb-0">
        <Outlet context={{ shopName } satisfies ShellContext} />
      </main>
    </div>
  );
}

function BrandLockup() {
  return <p className="hidden shrink-0 text-xl md:block font-extrabold tracking-[-0.02em] text-brand-text">{BRAND_NAME}</p>;
}

/** 화면 안에서 매장 이름(폰 제목 위 .p-shop 자리). 셸 밖(테스트에서 화면만 그릴 때)이면 자리 글자. */
export function useShopName(): string {
  return useOutletContext<ShellContext | undefined>()?.shopName ?? FALLBACK_SHOP_NAME;
}

/** 매장 이름. 받는 동안·못 받으면 자리 글자 — 이름은 보조 정보라 실패해도 화면을 막지 않는다. */
function useLoadedShopName(): string {
  const { shopId } = useSession();
  const load = useShopNameLoader();
  const [name, setName] = useState(FALLBACK_SHOP_NAME);
  const run = useCallback(() => load(shopId), [load, shopId]);
  useEffect(() => {
    let alive = true;
    run().then(
      (n) => alive && setName(n),
      () => alive && setName(FALLBACK_SHOP_NAME),
    );
    return () => {
      alive = false;
    };
  }, [run]);
  return name;
}
