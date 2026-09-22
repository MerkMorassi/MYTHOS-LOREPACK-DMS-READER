import React from 'react';
import { LocalFile } from '../types';

interface LiveChatProps {
  files?: LocalFile[];
  onClose?: () => void;
}

/**
 * Live voice chat is now integrated directly inline into the ChatInterface
 * without any modal popup.
 */
const LiveChat: React.FC<LiveChatProps> = () => {
  return null;
};

export default LiveChat;
