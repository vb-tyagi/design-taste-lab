export function buildHtmlProbeSystemPrompt(): string {
  return `You are a world-class UI designer who writes complete, production-quality HTML/CSS landing pages.

## YOUR JOB
Generate complete, self-contained HTML files that look like REAL websites. Each probe must be a FULLY DIFFERENT design — not the same layout with different colors.

## CRITICAL DESIGN RULES

1. **LOOK LIKE A REAL WEBSITE.** If someone screenshots your output, it should be indistinguishable from a real landing page. No "template" feeling. No placeholder vibes.

2. **EVERY PROBE MUST BE VISUALLY DISTINCT.** When placed side by side, a non-designer should instantly see these are different designs. Vary:
   - Layout structure (hero left-aligned vs centered vs split, grid vs list, sidebar vs no sidebar)
   - Typography character (big bold headlines vs refined small text vs mixed sizes)
   - Color palette (dark mode vs light mode vs warm neutrals vs cool tones)
   - Spacing and density (packed and information-rich vs spacious and minimal)
   - Surface treatment (flat vs cards with shadows vs glass/blur effects)
   - Navigation style (minimal topbar vs full nav vs floating nav)
   - Visual personality (corporate calm vs startup energy vs editorial elegance vs tech-forward)

3. **USE REALISTIC CONTENT.** Real-sounding headlines, real feature descriptions, real button text. Never "Lorem ipsum." The content should be for a fictional but believable product (a project management tool, analytics platform, design tool, etc.).

4. **SELF-CONTAINED.** Each HTML file must have ALL CSS inline in a <style> tag. Only external dependency allowed: ONE Google Fonts import. No images (use CSS gradients, shapes, or emoji for visual elements). No JavaScript.

5. **FULL PAGE.** Include: navigation bar, hero section, feature/benefit section (cards or grid), and a footer hint. This is a complete above-the-fold landing page.

6. **QUALITY BAR.** Think Linear, Vercel, Stripe, Notion, Arc browser, Raycast — that level of design craft in HTML/CSS.

## OUTPUT FORMAT
You must respond with a JSON object. Each probe's HTML must be a complete document starting with <!DOCTYPE html>.

Respond with ONLY valid JSON. No markdown code fences.`;
}

export function buildHtmlProbeUserPrompt(
  roundNumber: number,
  tasteMap: unknown,
  previousFeedback?: unknown,
  webTasteMap?: unknown,
  appTasteMap?: unknown,
  onboardingData?: unknown
): string {
  // Detect user's primary use case to adapt probe types
  const ob = (onboardingData || {}) as Record<string, string>;
  const useCase = (ob.useCase || '').toLowerCase();
  const isMobileApp = useCase.includes('mobile') || useCase.includes('app');
  const isDashboard = useCase.includes('dashboard') || useCase.includes('saas');
  const roundInstructions: Record<number, string> = {
    1: isMobileApp
      ? `## ROUND 1 — Explore 4 very different MOBILE APP directions

Generate 4 probes with MAXIMUM visual contrast. Each should feel like a completely different MOBILE APP by a completely different design team.

IMPORTANT: The user is designing a MOBILE APP. Generate mobile app screens, NOT landing pages.
- Use mobile viewport (375px width, full-height)
- Show real app screens: feed views, profile pages, settings, dashboards, chat/messaging, map views, or onboarding flows
- Include mobile navigation patterns: bottom tab bar, floating action buttons, swipe indicators
- Design for touch: large tap targets (44px+), thumb-zone-friendly layouts

Suggested contrast axes:
- Probe A: Dark, spacious, premium — think a high-end finance or productivity app
- Probe B: Light, warm, social — think a friendly social or lifestyle app
- Probe C: Dense, data-rich, functional — think a power-user tool with lots visible
- Probe D: Colorful, modern, playful — think a fresh consumer app with personality

Make them LOOK dramatically different.`
      : isDashboard
        ? `## ROUND 1 — Explore 4 very different DASHBOARD directions

Generate 4 probes with MAXIMUM visual contrast. Each should feel like a completely different DASHBOARD/SAAS PRODUCT.

IMPORTANT: The user is designing a dashboard/SaaS product. Generate product UI screens, NOT marketing landing pages.
- Show real dashboard views: data tables, analytics charts, sidebar navigation, settings panels
- Include product navigation: sidebar, breadcrumbs, tabs, search bars
- Design for productivity: dense but readable, clear information hierarchy

Suggested contrast axes:
- Probe A: Dark, minimal, dev-tool aesthetic — think Linear, Vercel, or Raycast
- Probe B: Light, clean, business-friendly — think Notion or Airtable
- Probe C: Dense, data-forward, analytical — think Bloomberg terminal meets modern UI
- Probe D: Warm, approachable, consumer-SaaS — think Figma or Canva dashboard

Make them LOOK dramatically different.`
        : `## ROUND 1 — Explore 4 very different directions

Generate 4 probes with MAXIMUM visual contrast. Each should feel like a completely different website by a completely different design team. All probes are LANDING PAGES for this round.

Suggested contrast axes (adapt based on taste map):
- Probe A: Dark, spacious, editorial — think premium SaaS like Linear or Vercel
- Probe B: Light, warm, organic — think Notion or Readwise vibes
- Probe C: Bold, dense, product-forward — think a power-user tool with lots of info visible
- Probe D: Colorful, modern, energetic — think a fresh startup with personality

Make them LOOK dramatically different. Different background colors, different layouts, different type sizes, different everything.`,

    2: `## ROUND 2 — Refine within the winning direction + test both surfaces

Based on the feedback, generate 4 probes:
- **Probe A & B: Landing page variants** — Two dialects within the winning direction. Same design family, different sub-styles (e.g., warmer vs cooler, tighter vs spacier, bolder vs subtler).
- **Probe C & D: Dashboard/app UI variants** — Apply the winning direction to a PRODUCT interface. Show a settings page, a data dashboard, or a list view. Adapt the taste for product context — usually means slightly tighter spacing, more functional typography, less dramatic hero treatment.

Tag each probe with its surface context in the JSON response.

The user will rate landing page probes and app probes separately, which helps us understand if their taste shifts between contexts.`,

    3: `## ROUND 3 — Final near-neighbor variants for both surfaces

Generate 3 probes — VERY similar, surgical differences:
- **Probe A: Landing page** — final-tuned landing page near the locked direction
- **Probe B: Dashboard/app** — final-tuned product UI near the locked direction
- **Probe C: Landing page variant** — tiny variation of Probe A (different weight, spacing, or color temperature)

These confirm the final taste for both surface types.`,
  };

  const probeCount: Record<number, number> = { 1: 4, 2: 4, 3: 3 };

  let context = `${roundInstructions[roundNumber] || roundInstructions[1]}

## Core Taste Map (shared DNA — use for all probes)
${JSON.stringify(tasteMap, null, 2)}`;

  if (webTasteMap && Object.keys(webTasteMap as object).length > 0) {
    context += `\n\n## Landing Page Taste Overrides (where landing pages differ from core)
${JSON.stringify(webTasteMap, null, 2)}`;
  }

  if (appTasteMap && Object.keys(appTasteMap as object).length > 0) {
    context += `\n\n## Product/App UI Taste Overrides (where dashboards/apps differ from core)
${JSON.stringify(appTasteMap, null, 2)}`;
  }

  if (previousFeedback) {
    context += `\n\n## Previous Round Feedback (what the user liked and disliked)
${JSON.stringify(previousFeedback, null, 2)}`;
  }

  return `${context}

Generate ${probeCount[roundNumber] || 4} complete HTML/CSS pages.

Respond with this exact JSON structure:
{
  "probes": [
    {
      "label": "Short memorable name for this direction",
      "description": "One sentence: what makes this design distinct",
      "surfaceContext": "web",
      "html": "<!DOCTYPE html><html>... COMPLETE HTML WITH INLINE CSS ...</html>"
    }
  ]
}

The "surfaceContext" field should be "web" for landing page probes or "app" for dashboard/product UI/mobile app probes. ${isMobileApp ? 'Round 1 probes are all "app" (mobile app screens).' : isDashboard ? 'Round 1 probes are all "app" (dashboard screens).' : 'Round 1 probes are all "web" (landing pages).'}

IMPORTANT: The "html" field must be a complete, valid HTML document with inline <style> tag. Make each one look like a REAL, professional website.`;
}
