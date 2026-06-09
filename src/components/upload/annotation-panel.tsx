'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ReferenceItem } from './reference-grid';

const ANNOTATION_TAGS = [
  { id: 'layout', label: 'Layout' },
  { id: 'typography', label: 'Typography' },
  { id: 'color', label: 'Color' },
  { id: 'surface', label: 'Surface' },
  { id: 'overall_vibe', label: 'Overall Vibe' },
];

interface AnnotationPanelProps {
  reference: ReferenceItem;
  onSave: (id: string, annotations: { tags: string[]; note: string }) => void;
  onClose: () => void;
}

export function AnnotationPanel({
  reference,
  onSave,
  onClose,
}: AnnotationPanelProps) {
  const [prevRefId, setPrevRefId] = useState(reference.id);
  const [tags, setTags] = useState<string[]>(
    reference.annotations?.tags || []
  );
  const [note, setNote] = useState(reference.annotations?.note || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset state when reference changes (derived state pattern — no useEffect needed)
  if (reference.id !== prevRefId) {
    setPrevRefId(reference.id);
    setTags(reference.annotations?.tags || []);
    setNote(reference.annotations?.note || '');
    setSaved(false);
  }

  // Detect if there's an existing annotation to show "Update" vs "Save"
  const hasExistingAnnotation = !!(
    reference.annotations &&
    (reference.annotations.tags.length > 0 || reference.annotations.note)
  );

  function toggleTag(tagId: string) {
    setTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId]
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(reference.id, { tags, note });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-2xl bg-[var(--surface-1)] p-6 shadow-[var(--shadow-md)]">
      <div className="mb-5 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Annotate: {reference.filename}
        </h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mb-5 aspect-video overflow-hidden rounded-xl bg-[var(--surface-2)]">
        <Image
          src={reference.path}
          alt={reference.filename}
          width={600}
          height={400}
          className="h-full w-full object-contain"
        />
      </div>

      <div className="mb-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          What draws you to this reference?
        </p>
        <div className="flex flex-wrap gap-2">
          {ANNOTATION_TAGS.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                tags.includes(tag.id)
                  ? 'bg-[var(--accent)] text-[var(--bg)] shadow-[var(--shadow-glow-accent)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="Optional: anything specific you love about this design..."
          className="w-full rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-shadow focus:shadow-[0_0_0_2px_var(--accent)]/30 focus:outline-none"
          rows={2}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
          saved
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-[var(--accent)] text-[var(--bg)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-glow-accent)]'
        } disabled:opacity-50`}
      >
        {saving
          ? 'Saving...'
          : saved
            ? '✓ Saved successfully'
            : hasExistingAnnotation
              ? 'Update Annotation'
              : 'Save Annotation'}
      </button>
    </div>
  );
}
