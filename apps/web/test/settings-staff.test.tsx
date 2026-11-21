// BEA-167 수용 기준(담당자): 등록·수정·숨김이 되고 원장 자신도 담당자로 등록할 수 있다 · 마지막 담당자는 숨길 수 없다 · 동시 수정은 안내. 데이터는 합성(절대 규칙 8).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { SessionLoaderProvider } from '@/features/auth/session';
import { createMemorySettingsApi, SettingsApiProvider, type SettingsApi } from '@/features/settings/api';
import { LAST_STAFF_TEXT } from '@/features/settings/messages';
import { seedSettings } from '@/features/settings/mockData';
import { STAFF_CONFLICT_TEXT, STAFF_HELP_TEXT } from '@/pages/settings/StaffPage';
import { routes } from '@/routes';

function renderAt(path: string, api: SettingsApi = createMemorySettingsApi()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionLoaderProvider value={async () => ({ shopId: 'shop-1' })}>
      <SettingsApiProvider value={api}>
        <RouterProvider router={router} />
      </SettingsApiProvider>
    </SessionLoaderProvider>,
  );
  return router;
}

const AT = '2026-11-01T00:00:00.000Z';
/** 담당자 2명(원장·실장)인 합성 매장. */
const twoStaffApi = () =>
  createMemorySettingsApi({
    ...seedSettings(),
    staff: [...seedSettings().staff, { id: 'staff-2', name: '이실장', active: true, version: 1, createdAt: AT, updatedAt: AT }],
  });

const names = async () => within(await screen.findByRole('list', { name: '담당자 목록' })).getAllByRole('listitem').map((li) => li.textContent?.replace('›', ''));
const sheet = () => screen.findByRole('dialog');
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
const save = async (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: '저장' }));

describe('담당자 화면', () => {
  it('설정 목록에서 이름 요약을 보고 들어간다', async () => {
    const router = renderAt('/settings');
    await userEvent.click(await screen.findByRole('link', { name: /담당자.*원장/ }));
    expect(router.state.location.pathname).toBe('/settings/staff');
  });

  it('담당자를 보이고, 추가 시트에서 원장도 담당자로 넣을 수 있다고 한 번 안내한다', async () => {
    renderAt('/settings/staff');
    expect(await names()).toEqual(['원장']);
    expect(screen.queryByText(STAFF_HELP_TEXT)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '담당자 추가' }));
    const input = within(await sheet()).getByLabelText('이름'); // 칸 이름은 "이름"만
    expect(input).toHaveAccessibleDescription(STAFF_HELP_TEXT);
    expect(screen.getAllByText(STAFF_HELP_TEXT)).toHaveLength(1);
  });

  it('담당자를 추가하고, 다시 "담당자 추가"를 열면 칸이 비어 있다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/staff', api);
    await userEvent.click(await screen.findByRole('button', { name: '담당자 추가' }));
    let d = await sheet();
    await userEvent.type(within(d).getByLabelText('이름'), '이실장');
    await save(d);
    await closed();
    expect(await names()).toEqual(['원장', '이실장']);
    expect((await api.listStaff()).map((s) => s.name)).toEqual(['원장', '이실장']);

    await userEvent.click(screen.getByRole('button', { name: '담당자 추가' }));
    d = await sheet();
    expect(within(d).getByLabelText('이름')).toHaveValue('');
  });

  it('이름이 비면 이유를 보이고 저장하지 않는다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/staff', api);
    await userEvent.click(await screen.findByRole('button', { name: '담당자 추가' }));
    const d = await sheet();
    await userEvent.type(within(d).getByLabelText('이름'), '   ');
    await save(d);
    expect(await within(d).findByText('이름을 입력해 주세요.')).toBeInTheDocument();
    expect(within(d).getByLabelText('이름')).toHaveAccessibleDescription(`이름을 입력해 주세요. ${STAFF_HELP_TEXT}`);
    expect(await api.listStaff()).toHaveLength(1);
  });

  it('이름을 고친다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/staff', api);
    await userEvent.click(await screen.findByRole('button', { name: /원장/ }));
    const input = within(await sheet()).getByLabelText('이름');
    await userEvent.clear(input);
    await userEvent.type(input, '박원장');
    await save(await sheet());
    await closed();
    expect((await api.listStaff())[0]).toMatchObject({ name: '박원장', version: 2 });
  });

  it('마지막 담당자는 숨길 수 없고 이유를 보인다', async () => {
    renderAt('/settings/staff');
    await userEvent.click(await screen.findByRole('button', { name: /원장/ }));
    const d = await sheet();
    expect(within(d).getByRole('button', { name: '담당자 숨기기' })).toBeDisabled();
    expect(within(d).getByText(LAST_STAFF_TEXT)).toBeInTheDocument();
  });

  it('둘 이상이면 숨길 수 있고, 다시 보이기로 되돌린다', async () => {
    const api = twoStaffApi();
    renderAt('/settings/staff', api);
    await userEvent.click(await screen.findByRole('button', { name: /이실장/ }));
    await userEvent.click(within(await sheet()).getByRole('button', { name: '담당자 숨기기' }));
    await closed();
    await waitFor(async () => expect(await names()).toEqual(['원장']));
    expect(screen.getByText('숨긴 담당자 1명')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이실장 다시 보이기' }));
    await waitFor(async () => expect(await names()).toEqual(['원장', '이실장']));
  });

  it('다른 곳에서 먼저 고쳤으면 안내하고 새 이름으로 다시 채운다', async () => {
    const api = createMemorySettingsApi();
    renderAt('/settings/staff', api);
    await userEvent.click(await screen.findByRole('button', { name: /원장/ }));
    const d = await sheet();
    const [first] = await api.listStaff();
    await api.updateStaff(first!.id, { version: first!.version, name: '대표 원장' });
    await userEvent.type(within(d).getByLabelText('이름'), '님');
    await save(d);
    expect(await screen.findByText(STAFF_CONFLICT_TEXT)).toBeInTheDocument();
    expect(within(await sheet()).getByLabelText('이름')).toHaveValue('대표 원장');
  });
});
