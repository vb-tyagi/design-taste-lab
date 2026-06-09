'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Probe {
  id: string;
  label: string;
  description: string;
  type: 'ai_image' | 'html_css' | 'screenshot';
  content: string;
  probeType: string;
  sourceUrl?: string;
}

type RatingType =
  | 'closest'
  | 'like_it'
  | 'too_cold'
  | 'too_generic'
  | 'too_ornamental'
  | 'dont_like_it';

const RATING_OPTIONS: { id: RatingType; label: string; emoji: string; color: string }[] = [
  { id: 'closest', label: 'This is it', emoji: '🎯', color: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' },
  { id: 'like_it', label: 'I like it', emoji: '👍', color: 'bg-blue-500/15 text-blue-400 ring-blue-500/30' },
  { id: 'too_cold', label: 'Too cold', emoji: '🥶', color: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/30' },
  { id: 'too_generic', label: 'Too generic', emoji: '😐', color: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
  { id: 'too_ornamental', label: 'Too much', emoji: '🎪', color: 'bg-purple-500/15 text-purple-400 ring-purple-500/30' },
  { id: 'dont_like_it', label: "Don't like it", emoji: '👎', color: 'bg-red-500/15 text-red-400 ring-red-500/30' },
];

function ProbeIframe({ html, label }: { html: string; label: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
    return () => URL.revokeObjectURL(url);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox=""
      className="h-full w-full"
      title={label}
      style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%', height: '200%' }}
    />
  );
}

export default function ProbesPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const roundNumber = parseInt(params.roundNumber as string, 10);

  const [probes, setProbes] = useState<Probe[]>([]);
  const [ratings, setRatings] = useState<
    Record<string, { rating: RatingType | null; bestPart: string; wrongPart: string }>
  >({});
  const [expandedProbe, setExpandedProbe] = useState<string | null>(null);
  const [escapeHatch, setEscapeHatch] = useState(false);
  const [escapeFeedback, setEscapeFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/rounds/${roundNumber}/probes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        setProbes(data.probes || []);
        setLoading(false);
      });
  }, [sessionId, roundNumber]);

  function setRating(probeId: string, rating: RatingType) {
    setRatings((prev) => ({
      ...prev,
      [probeId]: {
        rating,
        bestPart: prev[probeId]?.bestPart || '',
        wrongPart: prev[probeId]?.wrongPart || '',
      },
    }));
  }

  function setFeedback(probeId: string, field: 'bestPart' | 'wrongPart', value: string) {
    setRatings((prev) => ({
      ...prev,
      [probeId]: {
        rating: prev[probeId]?.rating || null,
        bestPart: prev[probeId]?.bestPart || '',
        wrongPart: prev[probeId]?.wrongPart || '',
        [field]: value,
      },
    }));
  }

  function isProbeEngaged(probeId: string): boolean {
    const r = ratings[probeId];
    if (!r) return false;
    return !!(r.rating || r.bestPart.trim() || r.wrongPart.trim());
  }

  async function handleSubmit() {
    setSubmitting(true);

    const responses = probes.map((probe) => {
      const r = ratings[probe.id];
      return {
        probeId: probe.id,
        ratingType: r?.rating || 'too_generic',
        notes: [r?.bestPart && `Best: ${r.bestPart}`, r?.wrongPart && `Wrong: ${r.wrongPart}`]
          .filter(Boolean)
          .join('. '),
        isEscapeHatch: escapeHatch,
        escapeFeedback: escapeHatch ? escapeFeedback : undefined,
      };
    });

    await fetch(`/api/rounds/${roundNumber}/probes/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, responses }),
    });

    // V2: go to side-by-side comparison flow after probe ratings
    router.push(`/session/${sessionId}/round/${roundNumber}/compare`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--surface-3)] border-t-[var(--accent)]" />
        <p className="mt-5 text-lg font-medium text-[var(--text-secondary)]">Designing your probes...</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">This usually takes 2-5 minutes</p>
      </div>
    );
  }

  const engagedCount = probes.filter((p) => isProbeEngaged(p.id)).length;
  const minRequired = Math.min(4, probes.length);
  const canSubmit = escapeHatch || engagedCount >= minRequired;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Glass header */}
      <div className="sticky top-0 z-10 glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--text-muted)]">Round {roundNumber}</span>
            <span className="text-[var(--surface-3)]">·</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Compare Designs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--accent)]">
              {engagedCount} / {minRequired} reviewed
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${Math.min((engagedCount / minRequired) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Which direction feels right?
          </h1>
          <p className="mt-3 text-lg text-[var(--text-secondary)]">
            Rate or leave feedback on at least {minRequired} designs.
            <span className="text-[var(--text-muted)]"> Click any design to see it full-size.</span>
          </p>
        </div>

        {/* Probe grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {probes.map((probe, idx) => {
            const r = ratings[probe.id];
            const engaged = isProbeEngaged(probe.id);

            return (
              <div
                key={probe.id}
                className={`overflow-hidden rounded-2xl transition-all duration-200 ${
                  r?.rating === 'closest'
                    ? 'shadow-[0_0_0_2px_#4ade80,0_0_30px_rgba(74,222,128,0.1)]'
                    : r?.rating === 'like_it'
                      ? 'shadow-[0_0_0_2px_#60a5fa,0_0_30px_rgba(96,165,250,0.1)]'
                      : r?.rating === 'dont_like_it'
                        ? 'shadow-[0_0_0_2px_#f87171,0_0_30px_rgba(248,113,113,0.1)]'
                        : engaged
                          ? 'shadow-[0_0_0_1px_var(--surface-3),var(--shadow-md)]'
                          : 'bg-[var(--surface-1)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]'
                }`}
              >
                {/* Preview — screenshot vs HTML probe */}
                <button
                  onClick={() => setExpandedProbe(expandedProbe === probe.id ? null : probe.id)}
                  className="relative block w-full overflow-hidden bg-white"
                  style={{ height: expandedProbe === probe.id ? '600px' : '360px' }}
                >
                  {probe.type === 'screenshot' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={probe.content}
                      alt={probe.label}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <ProbeIframe html={probe.content} label={probe.label} />
                  )}
                  {expandedProbe !== probe.id && (
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--surface-1)] to-transparent" />
                  )}
                </button>

                {/* Info + rating */}
                <div className="bg-[var(--surface-1)] p-6">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs font-bold text-[var(--text-muted)]">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">{probe.label}</h3>
                    {probe.type === 'screenshot' && (
                      <span className="rounded-lg bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                        Real site
                      </span>
                    )}
                  </div>
                  <p className="mb-5 text-sm text-[var(--text-muted)]">{probe.description}</p>

                  {/* Rating buttons */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    {RATING_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setRating(probe.id, opt.id)}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                          r?.rating === opt.id
                            ? `${opt.color} ring-1`
                            : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <span>{opt.emoji}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Feedback fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="👍 What works..."
                      value={r?.bestPart || ''}
                      onChange={(e) => setFeedback(probe.id, 'bestPart', e.target.value)}
                      className="rounded-xl bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-shadow focus:shadow-[0_0_0_2px_var(--accent)]/30 focus:outline-none"
                    />
                    <input
                      placeholder="👎 What's off..."
                      value={r?.wrongPart || ''}
                      onChange={(e) => setFeedback(probe.id, 'wrongPart', e.target.value)}
                      className="rounded-xl bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-shadow focus:shadow-[0_0_0_2px_var(--accent)]/30 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Escape hatch */}
        <div className="mt-10 rounded-2xl bg-[var(--surface-1)] p-6 shadow-[var(--shadow-sm)]">
          <label className="flex cursor-pointer items-center gap-4">
            <input
              type="checkbox"
              checked={escapeHatch}
              onChange={(e) => setEscapeHatch(e.target.checked)}
              className="h-5 w-5 rounded-lg border-[var(--surface-3)] bg-[var(--surface-2)] accent-[var(--accent)]"
            />
            <div>
              <span className="text-base font-semibold text-[var(--text-primary)]">
                None of these capture my taste
              </span>
              <p className="text-sm text-[var(--text-muted)]">
                Tell us what&apos;s missing and we&apos;ll adjust
              </p>
            </div>
          </label>
          {escapeHatch && (
            <textarea
              value={escapeFeedback}
              onChange={(e) => setEscapeFeedback(e.target.value)}
              placeholder="What's missing? Think of a website you love — what does it feel like that these don't?"
              className="mt-5 w-full rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-shadow focus:shadow-[0_0_0_2px_var(--accent)]/30 focus:outline-none"
              rows={3}
            />
          )}
        </div>

        {/* Submit */}
        <div className="mt-10 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="rounded-2xl bg-[var(--accent)] px-8 py-3.5 text-sm font-bold text-[var(--bg)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-glow-accent)] disabled:opacity-40"
          >
            {submitting
              ? 'Processing...'
              : !canSubmit
                ? `Review at least ${minRequired} designs to continue`
                : roundNumber < 3
                  ? `Continue to Round ${roundNumber + 1} →`
                  : 'Compile Taste Spec →'}
          </button>
        </div>
      </div>
    </div>
  );
}
