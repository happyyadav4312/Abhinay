import { describe, expect, it } from 'vitest';
import { canonicalInstagramUrl, portfolioLinkSchema } from '../../src/validators/profile.validator';
import { LIMITS } from '../../src/validators/common';

describe('Instagram reel links', () => {
  it('canonicalises the shapes Instagram shares, dropping tracking parameters', () => {
    const canonical = 'https://www.instagram.com/reel/CZ9VsSUBomM/';
    for (const input of [
      'https://www.instagram.com/reel/CZ9VsSUBomM/',
      'https://www.instagram.com/reel/CZ9VsSUBomM',
      'https://instagram.com/reel/CZ9VsSUBomM/?igsh=MWQ1ZGUxMzBkMA==',
      'https://www.instagram.com/reels/CZ9VsSUBomM/?utm_source=ig_web_copy_link',
      'https://www.instagram.com/madhuridixitnene/reel/CZ9VsSUBomM/',
      'http://m.instagram.com/reel/CZ9VsSUBomM/#comments',
      '  https://www.instagram.com/tv/CZ9VsSUBomM/  ',
    ]) {
      expect(canonicalInstagramUrl(input), input).toBe(canonical);
    }
    expect(canonicalInstagramUrl('https://www.instagram.com/p/CcrpAJPP5q0/')).toBe(
      'https://www.instagram.com/p/CcrpAJPP5q0/'
    );
  });

  it('refuses anything that is not an Instagram reel or post link', () => {
    for (const input of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://instagram.com.evil.example/reel/CZ9VsSUBomM/',
      'https://evil.example/https://www.instagram.com/reel/CZ9VsSUBomM/',
      'https://user:pass@www.instagram.com/reel/CZ9VsSUBomM/',
      'https://www.instagram.com:8443/reel/CZ9VsSUBomM/',
      'https://www.instagram.com/madhuridixitnene/',
      'https://www.instagram.com/reel/',
      'https://www.instagram.com/reel/abc/',
      'https://www.instagram.com/reel/CZ9VsSUBomM/extra/',
      'ftp://www.instagram.com/reel/CZ9VsSUBomM/',
      'www.instagram.com/reel/CZ9VsSUBomM/',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '',
    ]) {
      expect(canonicalInstagramUrl(input), input).toBeNull();
    }
  });

  it('validates the request body: canonical url, optional title, nothing else', () => {
    expect(
      portfolioLinkSchema.parse({ url: 'https://instagram.com/reel/CZ9VsSUBomM/?igsh=x' })
    ).toEqual({ url: 'https://www.instagram.com/reel/CZ9VsSUBomM/', title: null });

    expect(
      portfolioLinkSchema.parse({
        url: 'https://www.instagram.com/reel/CZ9VsSUBomM/',
        title: '  Monologue  ',
      }).title
    ).toBe('Monologue');

    expect(portfolioLinkSchema.safeParse({ url: 'https://example.com' }).success).toBe(false);
    expect(portfolioLinkSchema.safeParse({}).success).toBe(false);
    expect(
      portfolioLinkSchema.safeParse({
        url: `https://www.instagram.com/reel/CZ9VsSUBomM/?q=${'x'.repeat(LIMITS.PORTFOLIO_LINK_URL_MAX)}`,
      }).success
    ).toBe(false);
    expect(
      portfolioLinkSchema.safeParse({
        url: 'https://www.instagram.com/reel/CZ9VsSUBomM/',
        provider: 'CLOUDINARY',
      }).success
    ).toBe(false);
  });
});
