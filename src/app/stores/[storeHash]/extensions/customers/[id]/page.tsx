'use client';

import { useParams } from 'next/navigation';
import ChatPage from '@/components/chat/ChatPage';

export default function CustomerExtensionPage() {
  const params = useParams();
  const storeHash = params.storeHash as string;
  const customerId = params.id as string;

  return (
    <ChatPage
      storeHash={storeHash}
      context={{ type: 'customer', id: customerId }}
    />
  );
}
