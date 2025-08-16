import { 
  ContextualFeatureExtractor, 
  ContextualData, 
  CampInfo, 
  InjuryReport, 
  WeightCutInfo, 
  LayoffInfo, 
  VenueExperience, 
  OpponentHistory,
  FeatureExtractionConfig
} from '../contextual-feature-extractor.js';

describe('ContextualFeatureExtractor', () => {
  let extractor: ContextualFeatureExtractor;
  let mockContextualData: ContextualData;

  beforeEach(() => {
    extractor = new ContextualFeatureExtractor();
    
    // Create comprehensive mock data
    mockContextualData = {
      fighterId: 'fighter1',
      camp: {
        name: 'Jackson Wink MMA',
        location: 'Albuquerque, NM',
        headCoach: 'Greg Jackson',
        knownFor: ['striking', 'cardio', 'mental'],
        reputation: 8,
        facilities: ['octagon', 'wrestling room', 'strength training']
      },
      injuryHistory: [
        {
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          type: 'acute',
          bodyPart: 'knee',
          severity: 'moderate',
          recoveryTime: 60,
          impactOnPerformance: 0.3
        },
        {
          date: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago (outside lookback)
          type: 'chronic',
          bodyPart: 'back',
          severity: 'minor',
          recoveryTime: 0,
          impactOnPerformance: 0.1
        }
      ],
      weightCutHistory: [
        {
          fightDate: new Date('2024-02-01'),
          targetWeight: 155,
          actualWeight: 155,
          cutAmount: 20,
          difficulty: 'moderate',
          missedWeight: false,
          performanceImpact: -0.1
        },
        {
          fightDate: new Date('2023-10-01'),
          targetWeight: 155,
          actualWeight: 156,
          cutAmount: 25,
          difficulty: 'difficult',
          missedWeight: true,
          performanceImpact: -0.4
        }
      ],
      layoffInfo: {
        daysSinceLastFight: 120,
        reasonForLayoff: 'injury',
        activityLevel: 'training',
        rustFactor: 0.3
      },
      venueExperience: {
        country: 'USA',
        altitude: 5000,
        climate: 'arid',
        timeZoneChange: 2,
        previousFightsAtVenue: 2,
        recordAtVenue: { wins: 1, losses: 1 }
      },
      opponentHistory: {
        commonOpponents: [
          {
            opponentId: 'common1',
            fighterResult: 'win',
            currentOpponentResult: 'loss',
            fightDate: new Date('2023-05-01'),
            method: 'Decision'
          }
        ],
        styleMismatch: {
          strikingVsGrappling: 0.3,
          orthodoxVsSouthpaw: true,
          reachAdvantage: 3,
          paceMatch: 0.2
        },
        experienceGap: 2,
        sizeAdvantage: {
          heightDifference: 2,
          reachDifference: 3,
          weightDifference: 5
        }
      }
    };
  });

  describe('constructor', () => {
    it('should use default configuration when none provided', () => {
      const defaultExtractor = new ContextualFeatureExtractor();
      const config = defaultExtractor.getConfig();
      
      expect(config.injuryLookbackDays).toBe(365);
      expect(config.weightCutLookbackFights).toBe(5);
      expect(config.layoffThresholdDays).toBe(180);
      expect(config.altitudeThresholdFeet).toBe(3000);
      expect(config.timeZoneThresholdHours).toBe(3);
    });

    it('should use custom configuration when provided', () => {
      const customConfig: FeatureExtractionConfig = {
        injuryLookbackDays: 180,
        weightCutLookbackFights: 3,
        layoffThresholdDays: 90,
        altitudeThresholdFeet: 2000,
        timeZoneThresholdHours: 2
      };
      
      const customExtractor = new ContextualFeatureExtractor(customConfig);
      const config = customExtractor.getConfig();
      
      expect(config).toEqual(customConfig);
    });
  });

  describe('extractFeatures', () => {
    it('should extract all contextual features correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Verify all feature categories are present
      expect(features.campReputation).toBeDefined();
      expect(features.campSpecialization).toBeDefined();
      expect(features.recentInjuryImpact).toBeDefined();
      expect(features.chronicInjuryBurden).toBeDefined();
      expect(features.injuryRecoveryStatus).toBeDefined();
      expect(features.weightCutDifficulty).toBeDefined();
      expect(features.weightCutConsistency).toBeDefined();
      expect(features.missedWeightHistory).toBeDefined();
      expect(features.layoffDuration).toBeDefined();
      expect(features.rustFactor).toBeDefined();
      expect(features.activityDuringLayoff).toBeDefined();
      expect(features.altitudeAdjustment).toBeDefined();
      expect(features.timeZoneImpact).toBeDefined();
      expect(features.venueExperience).toBeDefined();
      expect(features.commonOpponentAdvantage).toBeDefined();
      expect(features.styleMismatchScore).toBeDefined();
      expect(features.sizeAdvantageScore).toBeDefined();
      expect(features.experienceAdvantage).toBeDefined();
      
      // Verify feature values are in expected ranges
      expect(features.campReputation).toBeGreaterThanOrEqual(0);
      expect(features.campReputation).toBeLessThanOrEqual(1);
      expect(features.campSpecialization).toHaveLength(6); // Number of specializations
    });
  });

  describe('camp features', () => {
    it('should extract camp reputation correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      expect(features.campReputation).toBe(0.8); // 8/10
    });

    it('should extract camp specialization as one-hot encoding', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Should have 6 specializations: striking, wrestling, bjj, cardio, strength, mental
      expect(features.campSpecialization).toHaveLength(6);
      expect(features.campSpecialization[0]).toBe(1); // striking
      expect(features.campSpecialization[1]).toBe(0); // wrestling (not in knownFor)
      expect(features.campSpecialization[2]).toBe(0); // bjj (not in knownFor)
      expect(features.campSpecialization[3]).toBe(1); // cardio
      expect(features.campSpecialization[4]).toBe(0); // strength (not in knownFor)
      expect(features.campSpecialization[5]).toBe(1); // mental
    });
  });

  describe('injury features', () => {
    it('should calculate recent injury impact correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Recent injury from January should have some impact
      expect(features.recentInjuryImpact).toBeGreaterThan(0);
      expect(features.recentInjuryImpact).toBeLessThanOrEqual(1);
    });

    it('should calculate chronic injury burden correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Has one chronic injury with 0.1 impact
      expect(features.chronicInjuryBurden).toBeGreaterThan(0);
      expect(features.chronicInjuryBurden).toBeLessThanOrEqual(1);
    });

    it('should handle no injuries', () => {
      const noInjuryData = {
        ...mockContextualData,
        injuryHistory: []
      };
      
      const features = extractor.extractFeatures(noInjuryData);
      
      expect(features.recentInjuryImpact).toBe(0);
      expect(features.chronicInjuryBurden).toBe(0);
      expect(features.injuryRecoveryStatus).toBe(1); // Fully recovered
    });

    it('should calculate injury recovery status correctly', () => {
      // Create injury that should be mostly recovered
      const recoveredInjuryData = {
        ...mockContextualData,
        injuryHistory: [
          {
            date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
            type: 'acute' as const,
            bodyPart: 'knee',
            severity: 'moderate' as const,
            recoveryTime: 60, // Expected 60 days recovery
            impactOnPerformance: 0.3
          }
        ]
      };
      
      const features = extractor.extractFeatures(recoveredInjuryData);
      expect(features.injuryRecoveryStatus).toBeGreaterThan(0.5); // Should be mostly recovered
    });
  });

  describe('weight cut features', () => {
    it('should calculate weight cut difficulty correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Average of moderate (0.5) and difficult (0.8) = 0.65
      expect(features.weightCutDifficulty).toBeCloseTo(0.65, 1);
    });

    it('should calculate weight cut consistency correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Should be less than 1 due to variation in cut amounts (20 vs 25)
      expect(features.weightCutConsistency).toBeLessThan(1);
      expect(features.weightCutConsistency).toBeGreaterThan(0);
    });

    it('should calculate missed weight history correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 1 out of 2 fights missed weight = 0.5
      expect(features.missedWeightHistory).toBe(0.5);
    });

    it('should handle no weight cut history', () => {
      const noWeightCutData = {
        ...mockContextualData,
        weightCutHistory: []
      };
      
      const features = extractor.extractFeatures(noWeightCutData);
      
      expect(features.weightCutDifficulty).toBe(0);
      expect(features.weightCutConsistency).toBe(1); // Perfect consistency with no data
      expect(features.missedWeightHistory).toBe(0);
    });
  });

  describe('layoff features', () => {
    it('should calculate layoff duration correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 120 days normalized by max 730 days
      expect(features.layoffDuration).toBeCloseTo(120 / 730, 2);
    });

    it('should extract rust factor directly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      expect(features.rustFactor).toBe(0.3);
    });

    it('should calculate activity during layoff correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 'training' activity level should map to 0.3
      expect(features.activityDuringLayoff).toBe(0.3);
    });

    it('should handle different activity levels', () => {
      const inactiveData = {
        ...mockContextualData,
        layoffInfo: {
          ...mockContextualData.layoffInfo,
          activityLevel: 'inactive' as const
        }
      };
      
      const features = extractor.extractFeatures(inactiveData);
      expect(features.activityDuringLayoff).toBe(0);
    });
  });

  describe('venue features', () => {
    it('should calculate altitude adjustment correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 5000 ft altitude should require adjustment, but venue experience helps
      expect(features.altitudeAdjustment).toBeLessThan(1);
      expect(features.altitudeAdjustment).toBeGreaterThan(0);
    });

    it('should calculate time zone impact correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 2 hour time zone change is below threshold (3), so should be 1
      expect(features.timeZoneImpact).toBe(1);
    });

    it('should calculate venue experience correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 2 fights with 50% win rate should give moderate experience score
      expect(features.venueExperience).toBeGreaterThan(0);
      expect(features.venueExperience).toBeLessThan(1);
    });

    it('should handle no venue experience', () => {
      const noVenueData = {
        ...mockContextualData,
        venueExperience: {
          ...mockContextualData.venueExperience,
          previousFightsAtVenue: 0,
          recordAtVenue: { wins: 0, losses: 0 }
        }
      };
      
      const features = extractor.extractFeatures(noVenueData);
      expect(features.venueExperience).toBe(0);
    });
  });

  describe('opponent features', () => {
    it('should calculate common opponent advantage correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Fighter won against someone opponent lost to = positive advantage
      expect(features.commonOpponentAdvantage).toBeGreaterThan(0);
      expect(features.commonOpponentAdvantage).toBeLessThanOrEqual(1);
    });

    it('should calculate style mismatch score correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Positive striking advantage, southpaw advantage, reach advantage
      expect(features.styleMismatchScore).toBeGreaterThan(0);
      expect(features.styleMismatchScore).toBeLessThanOrEqual(1);
    });

    it('should calculate size advantage score correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // Positive height, reach, and weight advantages
      expect(features.sizeAdvantageScore).toBeGreaterThan(0);
      expect(features.sizeAdvantageScore).toBeLessThanOrEqual(1);
    });

    it('should calculate experience advantage correctly', () => {
      const features = extractor.extractFeatures(mockContextualData);
      
      // 2 years more experience = positive advantage
      expect(features.experienceAdvantage).toBe(0.2); // 2/10
    });

    it('should handle no common opponents', () => {
      const noCommonData = {
        ...mockContextualData,
        opponentHistory: {
          ...mockContextualData.opponentHistory,
          commonOpponents: []
        }
      };
      
      const features = extractor.extractFeatures(noCommonData);
      expect(features.commonOpponentAdvantage).toBe(0);
    });
  });

  describe('categorical encoding', () => {
    it('should encode weight class correctly', () => {
      const encoding = extractor.encodeWeightClass('Lightweight');
      
      expect(encoding).toHaveLength(12); // Total number of weight classes
      expect(encoding[3]).toBe(1); // Lightweight is at index 3
      expect(encoding.filter(x => x === 1)).toHaveLength(1); // Only one should be 1
    });

    it('should encode stance correctly', () => {
      const orthodoxEncoding = extractor.encodeStance('Orthodox');
      const southpawEncoding = extractor.encodeStance('Southpaw');
      
      expect(orthodoxEncoding).toEqual([1, 0, 0]);
      expect(southpawEncoding).toEqual([0, 1, 0]);
    });

    it('should encode general categorical variables correctly', () => {
      const categories = ['cat1', 'cat2', 'cat3'];
      const encoding = extractor.encodeCategorical('cat2', categories);
      
      expect(encoding).toEqual([0, 1, 0]);
    });
  });

  describe('layoff impact calculation', () => {
    it('should calculate layoff impact with reason multiplier', () => {
      const injuryLayoff = {
        ...mockContextualData.layoffInfo,
        reasonForLayoff: 'injury' as const
      };
      
      const personalLayoff = {
        ...mockContextualData.layoffInfo,
        reasonForLayoff: 'personal' as const
      };
      
      const injuryImpact = extractor.calculateLayoffImpact(injuryLayoff);
      const personalImpact = extractor.calculateLayoffImpact(personalLayoff);
      
      // Injury layoffs should have higher impact than personal
      expect(injuryImpact).toBeGreaterThan(personalImpact);
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig = { injuryLookbackDays: 180, altitudeThresholdFeet: 2000 };
      extractor.updateConfig(newConfig);
      
      const config = extractor.getConfig();
      expect(config.injuryLookbackDays).toBe(180);
      expect(config.altitudeThresholdFeet).toBe(2000);
      expect(config.weightCutLookbackFights).toBe(5); // Should keep original value
    });

    it('should return copy of configuration', () => {
      const config1 = extractor.getConfig();
      const config2 = extractor.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });

  describe('edge cases', () => {
    it('should handle extreme values gracefully', () => {
      const extremeData: ContextualData = {
        ...mockContextualData,
        layoffInfo: {
          daysSinceLastFight: 1000, // Very long layoff
          reasonForLayoff: 'injury',
          activityLevel: 'inactive',
          rustFactor: 1.0
        },
        venueExperience: {
          country: 'Nepal',
          altitude: 15000, // Extreme altitude
          climate: 'cold',
          timeZoneChange: 12, // Maximum time zone difference
          previousFightsAtVenue: 0,
          recordAtVenue: { wins: 0, losses: 0 }
        }
      };
      
      const features = extractor.extractFeatures(extremeData);
      
      // All features should still be in valid ranges
      expect(features.layoffDuration).toBeLessThanOrEqual(1);
      expect(features.altitudeAdjustment).toBeGreaterThanOrEqual(0);
      expect(features.timeZoneImpact).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing or minimal data', () => {
      const minimalData: ContextualData = {
        fighterId: 'fighter1',
        camp: {
          name: 'Unknown Gym',
          location: 'Unknown',
          headCoach: 'Unknown',
          knownFor: [],
          reputation: 5,
          facilities: []
        },
        injuryHistory: [],
        weightCutHistory: [],
        layoffInfo: {
          daysSinceLastFight: 0,
          reasonForLayoff: 'other',
          activityLevel: 'training',
          rustFactor: 0
        },
        venueExperience: {
          country: 'USA',
          altitude: 0,
          climate: 'temperate',
          timeZoneChange: 0,
          previousFightsAtVenue: 0,
          recordAtVenue: { wins: 0, losses: 0 }
        },
        opponentHistory: {
          commonOpponents: [],
          styleMismatch: {
            strikingVsGrappling: 0,
            orthodoxVsSouthpaw: false,
            reachAdvantage: 0,
            paceMatch: 0
          },
          experienceGap: 0,
          sizeAdvantage: {
            heightDifference: 0,
            reachDifference: 0,
            weightDifference: 0
          }
        }
      };
      
      const features = extractor.extractFeatures(minimalData);
      
      // Should not throw errors and return reasonable defaults
      expect(features.campReputation).toBe(0.5);
      expect(features.recentInjuryImpact).toBe(0);
      expect(features.weightCutDifficulty).toBe(0);
      expect(features.commonOpponentAdvantage).toBe(0);
    });
  });
});