import { NextRequest, NextResponse } from 'next/server';
import { createReference } from '@/lib/db/queries';
import { captureScreenshot } from '@/lib/services/screenshot';
import { validateSessionId, assertSafeUrl } from '@/lib/security';

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { sessionId, url } = body;

  if (!sessionId || !url) {
    return NextResponse.json(
      { error: 'sessionId and url are required' },
      { status: 400 }
    );
  }

  if (!validateSessionId(sessionId)) {
    return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  // P1-1: SSRF protection — HTTPS-only + DNS-resolving private-IP guard.
  // Shared canonical validator (also enforced inside the screenshot service).
  let parsedUrl: URL;
  try {
    parsedUrl = await assertSafeUrl(url, { httpsOnly: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid URL' },
      { status: 400 }
    );
  }

  try {
    // Capture screenshot
    const result = await captureScreenshot(parsedUrl.toString(), sessionId);

    // Create reference record
    const hostname = parsedUrl.hostname.replace('www.', '');
    const filename = `${hostname}.png`;
    const id = createReference(
      sessionId,
      filename,
      result.filePath,
      'url',
      parsedUrl.toString()
    );

    return NextResponse.json({
      reference: {
        id,
        filename,
        path: result.filePath,
        source: 'url',
        sourceUrl: parsedUrl.toString(),
      },
    });
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return NextResponse.json(
      { error: 'Failed to capture screenshot. Please check the URL and try again.' },
      { status: 500 }
    );
  }
}
