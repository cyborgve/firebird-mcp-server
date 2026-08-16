import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecretStore } from './secret-store';

type SecretStoreSecrets = ConstructorParameters<typeof SecretStore>[0];
type MockSecretStoreSecrets = Pick<SecretStoreSecrets, 'store' | 'get' | 'delete'>;

describe('SecretStore', () => {
  let mockSecrets: MockSecretStoreSecrets;
  let mockGet: ReturnType<typeof vi.fn<(key: string) => Promise<string | undefined>>>;
  let store: SecretStore;

  beforeEach(() => {
    mockGet = vi.fn<(key: string) => Promise<string | undefined>>();
    mockSecrets = {
      store: vi.fn<(key: string, value: string) => Promise<void>>(),
      get: mockGet,
      delete: vi.fn<(key: string) => Promise<void>>(),
    };
    store = new SecretStore(mockSecrets as SecretStoreSecrets);
  });

  it('should set password', async () => {
    await store.setPassword('testpass');
    expect(mockSecrets.store).toHaveBeenCalledWith('firebirdMcp.password', 'testpass');
  });

  it('should get password', async () => {
    mockGet.mockResolvedValue('testpass');
    const password = await store.getPassword();
    expect(password).toBe('testpass');
    expect(mockSecrets.get).toHaveBeenCalledWith('firebirdMcp.password');
  });

  it('should delete password', async () => {
    await store.deletePassword();
    expect(mockSecrets.delete).toHaveBeenCalledWith('firebirdMcp.password');
  });
});
