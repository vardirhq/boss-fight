import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, statSync } from 'node:fs';

const documentHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const contentSecurityPolicy = /content="([^"]*default-src[^"]*)"/.exec(documentHtml)?.[1] ?? '';

/** The API is the only origin the app is allowed to reach at runtime. */
const permittedOrigins = ['https://boss-kamp.vardir.no'];

test('the app document requests nothing from a third-party origin', () => {
  // An offline-first product cannot depend on a CDN to render, and a family app that
  // stores children's data should not disclose device metadata to one on every launch.
  const remote = [...documentHtml.matchAll(/https?:\/\/[^"'\s>]+/g)]
    .map((match) => match[0])
    .filter((url) => !permittedOrigins.some((origin) => url.startsWith(origin)));
  assert.deepEqual(remote, [], 'index.html must not reference a third-party origin');
  assert.deepEqual([...styles.matchAll(/url\(\s*['"]?https?:/g)].map((m) => m[0]), [],
    'styles.css must not load remote assets');
});

test('the content security policy admits only self and the API', () => {
  assert.notEqual(contentSecurityPolicy, '', 'index.html must declare a content security policy');
  const directives = Object.fromEntries(contentSecurityPolicy.split(';')
    .map((directive) => directive.trim()).filter(Boolean)
    .map((directive) => { const [name, ...values] = directive.split(/\s+/); return [name, values]; }));

  assert.deepEqual(directives['font-src'], ["'self'"]);
  assert.deepEqual(directives['style-src'], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives['connect-src'], ["'self'", ...permittedOrigins]);
  assert.deepEqual(directives['object-src'], ["'none'"]);

  for (const [name, values] of Object.entries(directives)) {
    for (const value of values) {
      if (!value.startsWith('http')) continue;
      assert.ok(permittedOrigins.includes(value), `${name} must not allow ${value}`);
    }
  }
});

test('every declared font face resolves to a bundled file', () => {
  const sources = [...styles.matchAll(/src:\s*url\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  assert.ok(sources.length > 0, 'styles.css must declare bundled font faces');
  for (const source of sources) {
    assert.ok(source.startsWith('/fonts/'), `${source} must be served from the bundle`);
    // A missing file degrades silently to a system font, which is exactly the
    // failure self-hosting is meant to remove.
    const file = new URL(`../../public${source}`, import.meta.url);
    assert.ok(statSync(file).size > 0, `${source} must exist in public/`);
  }
  // Both families the interface names must be covered.
  for (const family of ['Press Start 2P', 'Space Grotesk']) {
    assert.match(styles, new RegExp(`font-family: '${family}'`), `${family} must have a bundled face`);
  }
});
