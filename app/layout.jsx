import './globals.css';

export const metadata = {
  title: 'Mage LMS',
  description: 'Learning management system: kurikulum, stage, pre/post-test, dan penilaian mentor.',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1d4ed8' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
