'use client';

import { useParams } from 'next/navigation';
import WorkerChatPanel from '@/components/chat/WorkerChatPanel';

export default function StoreDashboard() {
  const params = useParams();
  const storeHash = params.storeHash as string;

  return (
    <div style={{ height: '100vh' }}>
      <WorkerChatPanel
        storeHash={storeHash}
        title="Ask BC"
        subtitle="AI Store Assistant"
        suggestions={[
          'Give me a KPI summary of my store',
          'Show me my 5 most expensive products',
          'What are my recent orders?',
          'Which products are low on inventory?',
          'How is my shipping configured?',
          'How do I set up free shipping on orders over $50?',
        ]}
      />
    </div>
  );
}
