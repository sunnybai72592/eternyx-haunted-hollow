import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIPv4, isPublicIPv6, isPublicIpAddress, normalizeWebTarget } from '../supabase/functions/_shared/web-scan-safety.mjs';

test('accepts absolute HTTP(S) public hostnames and rejects unsafe URL forms', () => {
  assert.equal(normalizeWebTarget('https://example.com/path#fragment').toString(), 'https://example.com/path');
  assert.throws(() => normalizeWebTarget('file:///etc/passwd'), /Only HTTP and HTTPS/);
  assert.throws(() => normalizeWebTarget('http://user:pass@example.com'), /credentials/);
  assert.throws(() => normalizeWebTarget('http://127.0.0.1'), /IP-literal/);
  assert.throws(() => normalizeWebTarget('http://2130706433'), /IP-literal/);
  assert.throws(() => normalizeWebTarget('http://localhost'), /IP-literal|Local/);
  assert.throws(() => normalizeWebTarget('http://service.internal'), /Local/);
  assert.throws(() => normalizeWebTarget('https://example.com:8443'), /standard HTTP/);
  assert.throws(() => normalizeWebTarget('https://example.com:80'), /standard HTTP/);
  assert.throws(() => normalizeWebTarget('http://example.com:443'), /standard HTTP/);
});

test('rejects non-public IPv4 ranges', () => {
  for (const ip of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.0.0.8','192.0.2.1','192.168.1.1','198.18.0.1','198.51.100.2','203.0.113.10','224.0.0.1','255.255.255.255']) {
    assert.equal(isPublicIPv4(ip), false, ip);
  }
  assert.equal(isPublicIPv4('8.8.8.8'), true);
  assert.equal(isPublicIPv4('1.1.1.1'), true);
});

test('accepts global-unicast IPv6 and rejects special-use ranges', () => {
  assert.equal(isPublicIPv6('2606:4700:4700::1111'), true);
  assert.equal(isPublicIPv6('2001:4860:4860::8888'), true);
  for (const ip of ['::1','fe80::1','fc00::1','2001:db8::1','2002::1','::ffff:127.0.0.1']) {
    assert.equal(isPublicIPv6(ip), false, ip);
  }
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('fd00::1'), false);
});
