'use client';

import { useParams } from 'next/navigation';
import WorkerChatPanel from '@/components/chat/WorkerChatPanel';

export default function ProductExtensionPage() {
  const params = useParams();
  const storeHash = params.storeHash as string;
  const productId = params.id as string;

  return (
    <div style={{ height: '100vh' }}>
      <WorkerChatPanel
        storeHash={storeHash}
        context={{ type: 'product', id: productId }}
        title={`Product #${productId}`}
        subtitle="Ask BC · Product context"
        compact
      />
    </div>
  );
}
