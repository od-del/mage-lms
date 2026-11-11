/** @type {import('next').NextConfig} */

// Header keamanan untuk produksi (training.magepos.co.id).
// HSTS sengaja TANPA includeSubDomains/preload supaya tidak memengaruhi subdomain lain di magepos.co.id.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // LMS internal: jangan diindeks mesin pencari.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@libsql/client'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default nextConfig;
