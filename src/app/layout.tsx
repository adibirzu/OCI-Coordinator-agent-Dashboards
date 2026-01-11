import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';

export const metadata = {
  title: 'OCI/MCP View',
  description: 'Real-time architecture visualization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
