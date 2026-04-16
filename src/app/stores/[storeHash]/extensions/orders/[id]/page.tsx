'use client';

import { useParams } from 'next/navigation';
import WorkerChatPanel from '@/components/chat/WorkerChatPanel';

export default function OrderExtensionPage() {
  const params = useParams();
  const storeHash = params.storeHash as string;
  const orderId = params.id as string;

  return (
    <div style={{ height: '100vh' }}>
      <WorkerChatPanel
        storeHash={storeHash}
        context={{ type: 'order', id: orderId }}
        title={`Order #${orderId}`}
        subtitle="Ask BC · Order context"
        compact
      />
    </div>
  );
}
