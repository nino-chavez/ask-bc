'use client';

import { useParams } from 'next/navigation';
import ChatPage from '@/components/chat/ChatPage';

export default function ProductExtensionPage() {
  const params = useParams();
  const storeHash = params.storeHash as string;
  const productId = params.id as string;

  return (
    <ChatPage
      storeHash={storeHash}
      context={{ type: 'product', id: productId }}
    />
  );
}
