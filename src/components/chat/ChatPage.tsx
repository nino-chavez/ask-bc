'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Box, H1, Button, Text, Flex, FlexItem } from '@bigcommerce/big-design';
import { AddIcon } from '@bigcommerce/big-design-icons';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

interface ChatPageProps {
  storeHash: string;
}

export default function ChatPage({ storeHash }: ChatPageProps) {
  const [chatKey, setChatKey] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);

  const { messages, sendMessage, status } = useChat({
    id: `store-${storeHash}-${chatKey}`,
    transport: new DefaultChatTransport({
      api: `/stores/${storeHash}/api/chat`,
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleNewConversation = () => {
    setChatKey((k) => k + 1);
  };

  const handleSend = (text: string) => {
    sendMessage({ text });
  };

  return (
    <Flex style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Main chat area */}
      <FlexItem
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          padding="medium"
          style={{
            borderBottom: '1px solid #d9dce9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <H1 style={{ margin: 0, fontSize: '1.25rem' }}>Store Assistant</H1>
          <Button
            variant="secondary"
            onClick={handleNewConversation}
            iconLeft={<AddIcon />}
          >
            New Chat
          </Button>
        </Box>

        <MessageList messages={messages} isLoading={isLoading} />
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </FlexItem>
    </Flex>
  );
}
