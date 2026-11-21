// 머리줄에 보일 매장 이름 (화면 설계서 §3.1 "매장 전환" 자리). M1은 표시만 하고 바꾸기는 없다.
// 이름은 이미 있는 GET /api/shops/{shopId}(로그인 확인 #34, auth.openapi.yaml)로 받는다.
import type { OwnerShopResponse } from '@bv/contracts';
import { createContext, useContext } from 'react';
import { DEV_SKIP_LOGIN } from '@/features/auth/session';

export type ShopNameLoader = (shopId: string) => Promise<string>;

/** 이름을 못 받았을 때(개발용 로그인 건너뛰기 등) 보이는 자리 글자. */
export const FALLBACK_SHOP_NAME = '내 매장';

export async function fetchShopName(shopId: string): Promise<string> {
  const response = await fetch(`/api/shops/${encodeURIComponent(shopId)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`SHOP_${response.status}`);
  return ((await response.json()) as OwnerShopResponse).name;
}

// 개발용 로그인 건너뛰기에서는 서버가 없거나 가짜 매장(dev-shop)이라 부르지 않는다(콘솔 오류 방지).
// 이름은 디자인 장면과 같은 합성 매장(캘린더 가짜 데이터 seedDesignScene).
const devShopName: ShopNameLoader = async () => '라온 뷰티 성수점';
const ShopNameLoaderContext = createContext<ShopNameLoader>(DEV_SKIP_LOGIN ? devShopName : fetchShopName);
/** 테스트에서 매장 이름을 바꿔 끼울 때 쓴다. */
export const ShopNameLoaderProvider = ShopNameLoaderContext.Provider;
export const useShopNameLoader = () => useContext(ShopNameLoaderContext);
