'use client';

import { useParams } from 'next/navigation';
import ChatPage from '@/components/chat/ChatPage';

export default function StoreDashboard() {
  const params = useParams();
  const storeHash = params.storeHash as string;

  return <ChatPage storeHash={storeHash} />;
}
