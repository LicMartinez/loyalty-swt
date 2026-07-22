import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env vars before importing wallet
process.env.GOOGLE_ISSUER_ID = 'test-issuer';
process.env.GOOGLE_CLASS_ID = 'test-class';

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
    auth: {
        fromJSON: () => ({
            scopes: [],
            request: vi.fn().mockResolvedValue({ data: {} })
        })
    }
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
    default: { sign: vi.fn(() => 'mock-jwt-token') },
    sign: vi.fn(() => 'mock-jwt-token')
}));

// Mock gcp-service-account.json
vi.mock('../gcp-service-account.json', () => ({
    default: {
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: 'mock-private-key'
    },
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: 'mock-private-key'
}));

const { updateWalletPass, updateWalletPassOnTierChange, updateWithRetry } = await import('../wallet.js');

describe('wallet.js - updateWithRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('should succeed on first attempt if fn resolves', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        const promise = updateWithRetry(fn);
        await vi.runAllTimersAsync();
        await promise;
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry up to 3 times with delays [0, 5000, 30000]', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockRejectedValueOnce(new Error('fail 3'));

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const promise = updateWithRetry(fn);
        await vi.runAllTimersAsync();
        await promise;

        expect(fn).toHaveBeenCalledTimes(3);
        expect(consoleSpy).toHaveBeenCalledWith(
            '[wallet] Update failed after all retries:',
            'fail 3'
        );
        consoleSpy.mockRestore();
    });

    it('should succeed on second attempt after first failure', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockResolvedValueOnce(undefined);

        const promise = updateWithRetry(fn);
        await vi.runAllTimersAsync();
        await promise;

        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('wallet.js - updateWalletPass', () => {
    it('should return early if customerId is falsy (no wallet pass)', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = updateWalletPass(null, 5, 50, [], 'Oro', { visitsCompleted: 3, visitsRequired: 10 });
        expect(result).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
            '[wallet] Customer has no ID, skipping wallet update.'
        );
        consoleSpy.mockRestore();
    });

    it('should not throw when called with valid parameters', () => {
        expect(() => {
            updateWalletPass(
                'customer-uuid-123',
                10,
                100,
                ['Café gratis'],
                'Plata',
                { visitsCompleted: 5, visitsRequired: 10 }
            );
        }).not.toThrow();
    });

    it('should work with tierName undefined (falls back to Bronce)', () => {
        expect(() => {
            updateWalletPass('customer-uuid-123', 10, 100, [], undefined, undefined);
        }).not.toThrow();
    });
});

describe('wallet.js - updateWalletPassOnTierChange', () => {
    it('should return early if walletPassId is falsy', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = updateWalletPassOnTierChange('customer-123', null, 'Oro', { visitsCompleted: 2, visitsRequired: 10 });
        expect(result).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
            '[wallet] Customer customer-123 has no wallet pass, skipping update.'
        );
        consoleSpy.mockRestore();
    });

    it('should not throw when called with valid parameters', () => {
        expect(() => {
            updateWalletPassOnTierChange(
                'customer-123',
                'wallet-pass-id',
                'Oro',
                { visitsCompleted: 7, visitsRequired: 10 }
            );
        }).not.toThrow();
    });
});
