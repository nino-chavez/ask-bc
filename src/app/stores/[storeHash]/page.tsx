'use client';

import { useParams, useSearchParams } from 'next/navigation';
import ChatPage, { type ChatContext } from '@/components/chat/ChatPage';

const VALID_SECTIONS = ['orders', 'products', 'customers', 'marketing', 'settings'];

export default function StoreDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeHash = params.storeHash as string;

  let context: ChatContext | undefined;
  const section = searchParams.get('context');
  if (section && VALID_SECTIONS.includes(section)) {
    context = { type: 'section', id: section };
  }

  return <ChatPage storeHash={storeHash} context={context} />;
}
