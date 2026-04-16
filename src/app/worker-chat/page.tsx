'use client';

import WorkerChatPanel from '@/components/chat/WorkerChatPanel';

/**
 * Standalone Worker-backed chat page for demo and development.
 * Uses the shared WorkerChatPanel with default settings.
 */
export default function WorkerChatPage() {
  return (
    <div style={{ height: '100vh' }}>
      <WorkerChatPanel
        suggestions={[
          'Give me a KPI summary of my store',
          'Show me my 5 most expensive products',
          'Which products are low on inventory?',
          'What is the status of order #136?',
          'Create a coupon called SUMMER25 for 25% off',
          'How do I set up free shipping on orders over $50?',
        ]}
      />
    </div>
  );
}
