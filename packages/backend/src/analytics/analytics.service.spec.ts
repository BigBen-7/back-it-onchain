import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  describe('calculateTrustScore', () => {
    it('should return 0 when no games played', () => {
      const score = service.calculateTrustScore(0, 0);
      expect(score).toBe(0);
    });

    it('should return 100 when all games are wins', () => {
      const score = service.calculateTrustScore(10, 0);
      expect(score).toBe(100);
    });

    it('should return 0 when all games are losses', () => {
      const score = service.calculateTrustScore(0, 10);
      expect(score).toBe(0);
    });

    it('should calculate correct percentage for mixed results', () => {
      const score = service.calculateTrustScore(7, 3);
      expect(score).toBe(70);
    });

    it('should round correctly', () => {
      const score = service.calculateTrustScore(2, 3); // 40%
      expect(score).toBe(40);
    });
  });

  describe('calculateReputation', () => {
    it('should return positive reputation for more wins', () => {
      const rep = service.calculateReputation(10, 2);
      expect(rep).toBe(18);
    });

    it('should return negative reputation for more losses', () => {
      const rep = service.calculateReputation(2, 10);
      expect(rep).toBe(-6);
    });

    it('should return zero when balanced', () => {
      const rep = service.calculateReputation(5, 10);
      expect(rep).toBe(0);
    });

    it('should handle zero values correctly', () => {
      const rep = service.calculateReputation(0, 0);
      expect(rep).toBe(0);
    });
  });
});