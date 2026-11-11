// LMS internal untuk staf: blokir semua crawler.
export default function robots() {
  return { rules: { userAgent: '*', disallow: '/' } };
}
