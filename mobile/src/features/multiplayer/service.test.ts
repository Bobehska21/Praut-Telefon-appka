import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMe, syncProfile } from './service';

const mocks = vi.hoisted(() => ({
  request: vi.fn(), updateSettings: vi.fn(), setWasteman: vi.fn(),
  app: { settings: { nickname: 'Original' }, claimed: {}, achievements: [] },
  session: { joined: true, playerId: 'player-a', serverUrl: 'https://example.test', syncedNickname: 'Original' as string | undefined, setSyncedNickname: vi.fn() },
}));
vi.mock('expo-image-manipulator', () => ({}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('@/modules/focus', () => ({ FocusModule: { setWasteman: mocks.setWasteman } }));
vi.mock('@/features/progress/totals', () => ({ totalXp: () => 0 }));
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ ...mocks.app, updateSettings: mocks.updateSettings }) } }));
vi.mock('./store', () => ({ useMultiplayerStore: { getState: () => ({ ...mocks.session }) } }));
vi.mock('./api', async (importOriginal) => ({ ...await importOriginal<typeof import('./api')>(), request: mocks.request }));
vi.mock('./token', () => ({}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const profile = (nickname: string) => ({ nickname, state: 'focus' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.app.settings.nickname = 'Original';
  Object.assign(mocks.session, { joined: true, playerId: 'player-a', syncedNickname: 'Original' });
  mocks.session.setSyncedNickname.mockImplementation((nickname: string) => { mocks.session.syncedNickname = nickname; });
  mocks.updateSettings.mockImplementation(({ nickname }: { nickname: string }) => { mocks.app.settings.nickname = nickname; });
  mocks.request.mockResolvedValue(profile('Original'));
});

describe('nickname synchronization', () => {
  it('omits an unchanged nickname and adopts the admin replacement', async () => {
    mocks.request.mockResolvedValue(profile('Moderated'));
    await syncProfile();
    expect(mocks.request.mock.calls[0][1].body).not.toHaveProperty('nickname');
    expect(mocks.app.settings.nickname).toBe('Moderated');
    expect(mocks.session.syncedNickname).toBe('Moderated');
  });

  it('sends an edited nickname, including an intentionally empty one', async () => {
    mocks.app.settings.nickname = '';
    mocks.request.mockResolvedValue(profile(''));
    await syncProfile();
    expect(mocks.request.mock.calls[0][1].body.nickname).toBe('');
    expect(mocks.session.syncedNickname).toBe('');
  });

  it('keeps edits made during a save and sends the latest value in the next queued save', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    mocks.request.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(profile('Latest'));
    const first = syncProfile();
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    mocks.app.settings.nickname = 'Latest';
    const second = syncProfile();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    pending.resolve(profile('Moderated'));
    await first;
    expect(mocks.app.settings.nickname).toBe('Latest');
    await second;
    expect(mocks.request.mock.calls[1][1].body.nickname).toBe('Latest');
    expect(mocks.session.syncedNickname).toBe('Latest');
  });

  it('retries after a failed save', async () => {
    mocks.request.mockRejectedValueOnce(new Error('offline'));
    await expect(syncProfile()).rejects.toThrow('offline');
    await syncProfile();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it('adopts moderation on a refresh when there is no pending edit', async () => {
    mocks.request.mockResolvedValue(profile('Moderated'));
    await fetchMe();
    expect(mocks.app.settings.nickname).toBe('Moderated');
  });

  it('keeps a pending edit during a refresh', async () => {
    mocks.app.settings.nickname = 'My edit';
    mocks.request.mockResolvedValue(profile('Moderated'));
    await fetchMe();
    expect(mocks.app.settings.nickname).toBe('My edit');
    expect(mocks.session.syncedNickname).toBe('Original');
  });

  it('keeps an edit made while a refresh is in flight', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const refresh = fetchMe();
    mocks.app.settings.nickname = 'My edit';
    pending.resolve(profile('Moderated'));
    await refresh;
    expect(mocks.app.settings.nickname).toBe('My edit');
  });

  it('does not roll back a save completed after a refresh started', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    mocks.request.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(profile('New name'));
    const refresh = fetchMe();
    mocks.app.settings.nickname = 'New name';
    await syncProfile();
    pending.resolve(profile('Original'));
    await refresh;
    expect(mocks.app.settings.nickname).toBe('New name');
    expect(mocks.session.syncedNickname).toBe('New name');
  });

  it('ignores a save response from a previous account and cancels its queued save', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const first = syncProfile();
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    const second = syncProfile();
    const rejected = expect(second).rejects.toThrow('Session changed');
    mocks.session.playerId = 'player-b';
    pending.resolve(profile('Previous account'));
    await first;
    await rejected;
    expect(mocks.session.syncedNickname).toBe('Original');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('ignores a refresh response received after logout', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    mocks.request.mockReturnValueOnce(pending.promise);
    const refresh = fetchMe();
    mocks.session.joined = false;
    pending.resolve(profile('Moderated'));
    await refresh;
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.setWasteman).not.toHaveBeenCalled();
  });
});
