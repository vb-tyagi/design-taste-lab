/**
 * Round Orchestrator — Dynamic Method Selection
 *
 * Decides which 3 extraction methods to use in each round based on:
 * - Reference quality (count, annotation depth, focus)
 * - Taste map confidence levels
 * - Which methods have already been used
 * - Onboarding context (use case, experience)
 *
 * Available methods (6 total):
 * 1. Questionnaire — plain-language preference Qs
 * 2. What's Wrong? — spot the deliberate flaw
 * 3. Drag to Match — slider between two extremes
 * 4. Steal from URL — dissect a site into keepable components
 * 5. HTML/CSS Probes — AI-generated full-page designs to rate
 * 6. Side-by-side Compare — A/B pairs
 */

import { getSession, getSessionReferences } from '../db/queries';
import { TasteMap } from '../types';

export type ExtractionMethod =
  | 'questionnaire'
  | 'whats_wrong'
  | 'drag_to_match'
  | 'steal_from_url'
  | 'probes'
  | 'compare';

export interface RoundPlan {
  roundNumber: number;
  methods: ExtractionMethod[]; // Ordered — first method runs first
  reasoning: string;           // Why these methods were chosen
  methodConfigs: {
    [key in ExtractionMethod]?: {
      count?: number;          // How many items (questions, probes, pairs, etc.)
      targetAxes?: string[];   // Which axes to focus on
      depth?: 'light' | 'standard' | 'deep';
    };
  };
}

interface ReferenceQuality {
  count: number;
  annotatedCount: number;
  analyzedCount: number;
  hasUrls: boolean;
  focusScore: number;     // 0-1: how similar the refs are (1 = very focused)
  contradictionCount: number;
}

function assessReferenceQuality(sessionId: string): ReferenceQuality {
  const refs = getSessionReferences(sessionId);
  const annotated = refs.filter((r) => r.annotations && (r.annotations as { tags: string[] }).tags?.length > 0);
  const analyzed = refs.filter((r) => r.analysis);
  const hasUrls = refs.some((r) => (r.source as string) === 'url');

  // Simple focus score: if all refs have similar analysis, they're focused
  // This is a rough heuristic — could be improved with embedding similarity
  const focusScore = refs.length <= 2 ? 0.9 : refs.length <= 4 ? 0.7 : refs.length <= 6 ? 0.45 : 0.3;

  return {
    count: refs.length,
    annotatedCount: annotated.length,
    analyzedCount: analyzed.length,
    hasUrls,
    focusScore,
    // TODO: contradictionCount should be derived from CriticOutput.contradictions
    // when available (pass critic output into assessReferenceQuality or read from session)
    contradictionCount: 0,
  };
}

function getUncertainAxes(tasteMap: TasteMap | null): string[] {
  if (!tasteMap) return [];
  return Object.entries(tasteMap)
    .filter(([, v]) => v.confidence < 0.7)
    .sort((a, b) => a[1].confidence - b[1].confidence)
    .map(([k]) => k);
}

function getLockedAxes(tasteMap: TasteMap | null): string[] {
  if (!tasteMap) return [];
  return Object.entries(tasteMap)
    .filter(([, v]) => v.confidence >= 0.85)
    .map(([k]) => k);
}

/**
 * Plan Round 1 — wide net, fast signal extraction.
 *
 * Picks 3 methods based on reference quality.
 */
export function planRound1(sessionId: string): RoundPlan {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const refQuality = assessReferenceQuality(sessionId);
  const tasteMap = session.tasteMap as TasteMap | null;
  const uncertainAxes = getUncertainAxes(tasteMap);

  const methods: ExtractionMethod[] = [];
  const methodConfigs: RoundPlan['methodConfigs'] = {};
  let reasoning = '';

  // Decision tree for Round 1
  if (refQuality.count >= 5 && refQuality.annotatedCount >= 3) {
    // SCENARIO: Focused refs, well-annotated
    // → What's Wrong (precision), Probes (visual), light Questionnaire
    methods.push('whats_wrong', 'probes', 'questionnaire');
    methodConfigs.whats_wrong = { count: 4, targetAxes: uncertainAxes.slice(0, 4) };
    methodConfigs.probes = { count: 3, targetAxes: uncertainAxes.slice(0, 5) };
    methodConfigs.questionnaire = { count: 6, depth: 'light' };
    reasoning = 'Focused, well-annotated references — precision testing with probes and flaw detection';

  } else if (refQuality.count >= 3 && refQuality.hasUrls) {
    // SCENARIO: Has URL refs — can use Steal from URL
    // → Steal from URL, Questionnaire, Compare
    methods.push('steal_from_url', 'questionnaire', 'compare');
    methodConfigs.steal_from_url = {};
    methodConfigs.questionnaire = { count: 8, depth: 'standard' };
    methodConfigs.compare = { count: 4 };
    reasoning = 'URL references available — dissecting for precise component-level taste';

  } else if (refQuality.count >= 5 && refQuality.focusScore < 0.5) {
    // SCENARIO: Many scattered refs, contradictions
    // → Questionnaire (fill gaps), Compare (resolve contradictions), Drag to Match (precise)
    methods.push('questionnaire', 'compare', 'drag_to_match');
    methodConfigs.questionnaire = { count: 12, depth: 'deep' };
    methodConfigs.compare = { count: 5 };
    methodConfigs.drag_to_match = { count: 3, targetAxes: uncertainAxes.slice(0, 3) };
    reasoning = 'Scattered references with contradictions — resolving through comparisons and deep questionnaire';

  } else {
    // SCENARIO: Default — few refs or unknown quality
    // → Questionnaire (broad), Probes (visual), Drag to Match or Compare
    methods.push('questionnaire', 'probes');
    methodConfigs.questionnaire = { count: 15, depth: 'deep' };
    methodConfigs.probes = { count: 4 };

    if (refQuality.count >= 3) {
      methods.push('compare');
      methodConfigs.compare = { count: 4 };
    } else {
      methods.push('drag_to_match');
      methodConfigs.drag_to_match = { count: 3, targetAxes: uncertainAxes.slice(0, 3) };
    }
    reasoning = 'Limited reference signal — using broad questionnaire and probes for initial calibration';
  }

  return {
    roundNumber: 1,
    methods,
    reasoning,
    methodConfigs,
  };
}

/**
 * Plan Round 2 — surgical refinement. Only runs if confidence < 85%.
 */
export function planRound2(sessionId: string): RoundPlan {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const tasteMap = session.tasteMap as TasteMap | null;
  const uncertainAxes = getUncertainAxes(tasteMap);
  const lockedAxes = getLockedAxes(tasteMap);

  const methods: ExtractionMethod[] = [];
  const methodConfigs: RoundPlan['methodConfigs'] = {};
  let reasoning = '';

  if (uncertainAxes.length <= 5) {
    // Few uncertain axes — surgical approach
    methods.push('probes', 'compare', 'drag_to_match');
    methodConfigs.probes = { count: 3, targetAxes: uncertainAxes, depth: 'light' };
    methodConfigs.compare = { count: 3 };
    methodConfigs.drag_to_match = { count: 2, targetAxes: uncertainAxes.slice(0, 2) };
    reasoning = `Only ${uncertainAxes.length} uncertain axes (${lockedAxes.length} locked) — surgical near-neighbor probes + drag sliders`;

  } else if (uncertainAxes.length <= 10) {
    // Moderate uncertainty — mix of methods
    methods.push('whats_wrong', 'probes', 'drag_to_match');
    methodConfigs.whats_wrong = { count: 3, targetAxes: uncertainAxes.slice(0, 3) };
    methodConfigs.probes = { count: 4, targetAxes: uncertainAxes };
    methodConfigs.drag_to_match = { count: 3, targetAxes: uncertainAxes.slice(3, 6) };
    reasoning = `${uncertainAxes.length} uncertain axes — combining precision testing with probes and sliders`;

  } else {
    // High uncertainty — need broader coverage
    methods.push('questionnaire', 'probes', 'compare');
    methodConfigs.questionnaire = { count: 8, targetAxes: uncertainAxes, depth: 'standard' };
    methodConfigs.probes = { count: 4 };
    methodConfigs.compare = { count: 4 };
    reasoning = `${uncertainAxes.length} uncertain axes still — broader round 2 with questionnaire + probes`;
  }

  return {
    roundNumber: 2,
    methods,
    reasoning,
    methodConfigs,
  };
}

/**
 * Check if we should skip to compilation (confidence is high enough).
 */
export function shouldSkipRound2(sessionId: string): {
  skip: boolean;
  confidence: number;
  reason: string;
} {
  const session = getSession(sessionId);
  if (!session) return { skip: false, confidence: 0, reason: 'Session not found' };

  const tasteMap = session.tasteMap as TasteMap | null;
  if (!tasteMap) return { skip: false, confidence: 0, reason: 'No taste map' };

  const axes = Object.values(tasteMap);
  const avgConfidence = axes.reduce((sum, a) => sum + a.confidence, 0) / axes.length;
  const lowConfidenceCount = axes.filter((a) => a.confidence < 0.6).length;

  if (avgConfidence >= 0.85 && lowConfidenceCount === 0) {
    return {
      skip: true,
      confidence: avgConfidence,
      reason: `Average confidence ${(avgConfidence * 100).toFixed(0)}% with no low-confidence axes — ready to compile`,
    };
  }

  return {
    skip: false,
    confidence: avgConfidence,
    reason: `Average confidence ${(avgConfidence * 100).toFixed(0)}% with ${lowConfidenceCount} low-confidence axes — need Round 2`,
  };
}
