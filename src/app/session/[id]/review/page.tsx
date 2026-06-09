'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';

interface Cluster {
  id: string;
  name: string;
  description: string;
  memberRefIds: string[];
  dominanceScore: number;
}

interface Contradiction {
  clusterA: string;
  clusterB: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

interface Reference {
  id: string;
  filename: string;
  path: string;
  surfaceType: string;
  role: string;
  weight: number;
  clusterId: string | null;
}

interface SessionData {
  clusters: {
    clusters: Cluster[];
    outlierRefIds: string[];
    contradictions: Contradiction[];
  } | null;
}

const SURFACE_LABELS: Record<string, string> = {
  marketing_landing: 'Landing Page',
  product_web_app: 'Web App',
  mobile_app: 'Mobile',
  editorial: 'Editorial',
  visual_brand: 'Brand',
  unknown: 'Unknown',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/15 text-red-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-blue-500/15 text-blue-400',
};

const ROLE_STYLES: Record<string, { label: string; color: string }> = {
  anchor: { label: '⚓ Anchor', color: 'text-[var(--accent)]' },
  peripheral: { label: '🌙 Mood', color: 'text-[var(--text-muted)]' },
  outlier: { label: '⚠️ Outlier', color: 'text-amber-400' },
  unclassified: { label: '', color: '' },
};

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);

  // Track user outlier decisions
  const [outlierDecisions, setOutlierDecisions] = useState<
    Record<string, 'keep' | 'deweight' | 'exclude'>
  >({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/references`).then((r) => r.json()).catch(() => []),
    ]).then(([sessionData, refsData]) => {
      setSession(sessionData);
      setReferences(refsData.references || refsData || []);
      setLoading(false);

      // Pre-fill outlier decisions
      const outliers = sessionData.clusters?.outlierRefIds || [];
      const decisions: Record<string, 'keep' | 'deweight' | 'exclude'> = {};
      outliers.forEach((id: string) => { decisions[id] = 'deweight'; });
      setOutlierDecisions(decisions);
    });
  }, [sessionId]);

  function getClusterRefs(cluster: Cluster): Reference[] {
    return references.filter((r) => cluster.memberRefIds.includes(r.id));
  }

  function getOutlierRefs(): Reference[] {
    const outlierIds = session?.clusters?.outlierRefIds || [];
    return references.filter((r) => outlierIds.includes(r.id));
  }

  async function handleContinue() {
    setContinuing(true);

    // Batch all outlier decisions into a single API call
    const updates: { refId: string; weight: number; role: string }[] = [];
    for (const [refId, decision] of Object.entries(outlierDecisions)) {
      if (decision === 'exclude') {
        updates.push({ refId, weight: 0, role: 'outlier' });
      } else if (decision === 'keep') {
        updates.push({ refId, weight: 1.0, role: 'unclassified' });
      }
      // 'deweight' is the default — already set by clusterer
    }

    if (updates.length > 0) {
      await fetch('/api/references/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, updates }),
      });
    }

    // Transition to round 1 questionnaire
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'round_1_questionnaire' }),
    });

    router.push(`/session/${sessionId}/round/1/hub`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--surface-3)] border-t-[var(--accent)]" />
      </div>
    );
  }

  const clusters = session?.clusters?.clusters || [];
  const contradictions = session?.clusters?.contradictions || [];
  const outlierRefs = getOutlierRefs();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Glass header */}
      <div className="sticky top-0 z-10 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="text-sm font-medium text-[var(--text-muted)]">Analysis Complete</span>
          <span className="text-sm font-semibold text-[var(--accent)]">
            {clusters.length} cluster{clusters.length !== 1 && 's'} detected
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Review Your Taste Clusters
          </h1>
          <p className="mt-3 text-lg text-[var(--text-secondary)]">
            We grouped your references into aesthetic families.
            <span className="text-[var(--text-muted)]"> Review the clusters and handle any outliers before we start calibrating.</span>
          </p>
        </div>

        {/* Clusters */}
        <div className="space-y-8">
          {clusters.map((cluster) => {
            const clusterRefs = getClusterRefs(cluster);
            return (
              <div
                key={cluster.id}
                className="rounded-2xl bg-[var(--surface-1)] p-6 shadow-[var(--shadow-sm)]"
              >
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-[var(--text-primary)]">
                        {cluster.name}
                      </h2>
                      <span className="rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                        {Math.round(cluster.dominanceScore * 100)}% dominant
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {cluster.description}
                    </p>
                  </div>
                  <span className="text-sm text-[var(--text-muted)]">
                    {clusterRefs.length} reference{clusterRefs.length !== 1 && 's'}
                  </span>
                </div>

                {/* Reference thumbnails */}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {clusterRefs.map((ref) => {
                    const roleStyle = ROLE_STYLES[ref.role] || ROLE_STYLES.unclassified;
                    return (
                      <div key={ref.id} className="group relative">
                        <div className="aspect-[3/4] overflow-hidden rounded-xl bg-[var(--surface-2)]">
                          <Image
                            src={ref.path}
                            alt={ref.filename}
                            fill
                            className="object-cover"
                            sizes="150px"
                          />
                        </div>
                        <div className="mt-2">
                          <p className="truncate text-xs text-[var(--text-muted)]">{ref.filename}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {SURFACE_LABELS[ref.surfaceType] || ref.surfaceType}
                            </span>
                            {roleStyle.label && (
                              <span className={`text-[10px] font-medium ${roleStyle.color}`}>
                                {roleStyle.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Outliers */}
        {outlierRefs.length > 0 && (
          <div className="mt-10 rounded-2xl bg-amber-500/5 p-6 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]">
            <h2 className="mb-2 text-xl font-bold text-amber-400">
              ⚠️ Outliers Detected
            </h2>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              These references don&apos;t fit the main patterns. They might be accidents, aspirational picks, or a genuinely different taste direction.
            </p>

            <div className="space-y-4">
              {outlierRefs.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center gap-4 rounded-xl bg-[var(--surface-1)] p-4"
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-2)]">
                    <Image
                      src={ref.path}
                      alt={ref.filename}
                      width={48}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{ref.filename}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {SURFACE_LABELS[ref.surfaceType] || ref.surfaceType}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {(['keep', 'deweight', 'exclude'] as const).map((decision) => (
                      <button
                        key={decision}
                        onClick={() =>
                          setOutlierDecisions((prev) => ({ ...prev, [ref.id]: decision }))
                        }
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                          outlierDecisions[ref.id] === decision
                            ? decision === 'keep'
                              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                              : decision === 'deweight'
                                ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                                : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                            : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]'
                        }`}
                      >
                        {decision === 'keep' ? 'Keep' : decision === 'deweight' ? 'De-weight' : 'Exclude'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contradictions */}
        {contradictions.length > 0 && (
          <div className="mt-10 rounded-2xl bg-[var(--surface-1)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
              Tensions Detected
            </h2>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              We found aesthetic contradictions between your clusters. These aren&apos;t bad — they help us ask better questions.
            </p>

            <div className="space-y-3">
              {contradictions.map((c, i) => {
                const clusterA = clusters.find((cl) => cl.id === c.clusterA);
                const clusterB = clusters.find((cl) => cl.id === c.clusterB);
                return (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] p-4">
                    <span className={`mt-0.5 shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${SEVERITY_COLORS[c.severity]}`}>
                      {c.severity}
                    </span>
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{c.description}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {clusterA?.name || c.clusterA} vs {clusterB?.name || c.clusterB}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Continue button */}
        <div className="mt-12 flex justify-end">
          <button
            onClick={handleContinue}
            disabled={continuing}
            className="rounded-2xl bg-[var(--accent)] px-8 py-4 text-base font-bold text-[var(--bg)] shadow-[var(--shadow-md)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-glow-accent)] disabled:opacity-50"
          >
            {continuing ? 'Preparing...' : 'Looks good — Start Calibration →'}
          </button>
        </div>
      </div>
    </div>
  );
}
