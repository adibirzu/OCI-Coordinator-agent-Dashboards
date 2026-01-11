import { LogStream } from '@/components/dashboard/LogStream';
import { EnhancedChat } from '@/components/chat/EnhancedChat';
import { ResizableLayout } from '@/components/common/ResizableLayout';
import { VerticalResizableLayout } from '@/components/common/VerticalResizableLayout';
import { TopLeftPanel } from '@/components/dashboard/TopLeftPanel';
import { QuickOverview } from '@/components/dashboard/QuickOverview';
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>OCI Coordinator Dashboard</h1>
      <div className={styles.dashboard} style={{ height: 'calc(100vh - 100px)' }}>
        <ResizableLayout
          initialLeftWidth={40}
          left={
            <VerticalResizableLayout
              initialTopHeight={50}
              top={
                <TopLeftPanel />
              }
              bottom={
                <div className={styles.logsSection} style={{ height: '100%', overflow: 'hidden' }}>
                  <LogStream />
                </div>
              }
            />
          }
          right={
            <VerticalResizableLayout
              initialTopHeight={30}
              top={
                <div className={styles.statusSection} style={{ height: '100%', overflow: 'auto' }}>
                  <QuickOverview />
                </div>
              }
              bottom={
                <div className={styles.chatSection} style={{ height: '100%', overflow: 'hidden' }}>
                  <EnhancedChat />
                </div>
              }
            />
          }
        />
      </div>
    </main>
  );
}
