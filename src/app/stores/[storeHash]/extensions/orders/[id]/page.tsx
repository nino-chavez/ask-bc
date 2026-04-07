'use client';

import { useParams } from 'next/navigation';
import ChatPage from '@/components/chat/ChatPage';

export default function OrderExtensionPage() {
  const params = useParams();
  const storeHash = params.storeHash as string;
  const orderId = params.id as string;

  return (
    <ChatPage
      storeHash={storeHash}
      context={{ type: 'order', id: orderId }}
    />
  );
}
