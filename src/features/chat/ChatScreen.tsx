import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useApp } from '../../app/context/AppContext';
import { ChatMessageProjection } from '../../data/repositories/ChatRepository';
import { LIMITS } from '../../shared/constants/config';

export const ChatScreen: React.FC = () => {
  const { services, identity, refreshCounter, triggerRefresh } = useApp();

  const [channel, setChannel] = useState<'BROADCAST' | 'DIRECT'>('BROADCAST');
  const [messages, setMessages] = useState<ChatMessageProjection[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [recipientKey, setRecipientKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!services) return;
    setIsLoading(true);

    try {
      const all = await services.chatService.getMessages();
      setMessages(all);
    } catch (err) {
      console.warn('Failed to load chat messages', err);
    } finally {
      setIsLoading(false);
    }
  }, [services]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages, refreshCounter]);

  const handleSendMessage = async () => {
    if (!services || !identity || !inputText.trim() || isSending) return;

    setIsSending(true);
    setErrorNotice(null);

    try {
      await services.chatService.sendMessage(
        {
          text: inputText.trim(),
          recipientPublicKey: channel === 'DIRECT' ? recipientKey.trim() || undefined : undefined
        },
        identity
      );

      setInputText('');
      triggerRefresh();
      await loadMessages();
    } catch (err: any) {
      setErrorNotice(err?.message ?? 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (channel === 'BROADCAST') return m.messageType === 'BROADCAST';
    return m.messageType === 'DIRECT';
  });

  const renderMessageItem = ({ item }: { item: ChatMessageProjection }) => {
    const isSelf = identity?.publicKey === item.senderPublicKey;
    const shortSender = `${item.senderPublicKey.slice(0, 8)}...`;

    return (
      <View style={[styles.messageBubble, isSelf ? styles.selfBubble : styles.peerBubble]}>
        <View style={styles.bubbleHeader}>
          <Text style={styles.senderText}>{isSelf ? 'You' : `Peer: ${shortSender}`}</Text>
          <Text style={styles.timeText}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <Text style={styles.bodyText}>{item.body}</Text>

        <View style={styles.bubbleFooter}>
          <Text style={styles.stateTag}>
            {item.deliveryState === 'PENDING' ? '⏳ Queued for radio' : '✓ Relayed'}
          </Text>
          {item.messageType === 'DIRECT' && (
            <Text style={styles.directTag}>[DIRECT]</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Privacy Notice Banner */}
      <View style={styles.privacyBanner}>
        <Text style={styles.privacyIcon}>⚠️</Text>
        <Text style={styles.privacyText}>
          <Text style={styles.privacyBold}>PLAINTEXT RELAY NOTICE: </Text>
          MVP radio chat is relayed in plaintext across nearby devices. Messages are NOT end-to-end
          encrypted. Do not send passwords or private credentials.
        </Text>
      </View>

      {/* Channel Selector */}
      <View style={styles.channelRow}>
        <TouchableOpacity
          style={[styles.channelBtn, channel === 'BROADCAST' && styles.activeChannelBtn]}
          onPress={() => setChannel('BROADCAST')}
          accessibilityRole="tab"
          accessibilityLabel="Broadcast Channel"
        >
          <Text style={[styles.channelBtnText, channel === 'BROADCAST' && styles.activeChannelBtnText]}>
            Nearby Broadcast
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.channelBtn, channel === 'DIRECT' && styles.activeChannelBtn]}
          onPress={() => setChannel('DIRECT')}
          accessibilityRole="tab"
          accessibilityLabel="Direct Messages"
        >
          <Text style={[styles.channelBtnText, channel === 'DIRECT' && styles.activeChannelBtnText]}>
            Direct Messages
          </Text>
        </TouchableOpacity>
      </View>

      {/* Direct recipient input if in direct mode */}
      {channel === 'DIRECT' && (
        <View style={styles.recipientRow}>
          <Text style={styles.recipientLabel}>To Peer Key:</Text>
          <TextInput
            style={styles.recipientInput}
            placeholder="Paste base64url peer public key..."
            placeholderTextColor={colors.textMuted}
            value={recipientKey}
            onChangeText={setRecipientKey}
            accessibilityLabel="Recipient Public Key"
          />
        </View>
      )}

      {/* Message Feed */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.info} />
        </View>
      ) : filteredMessages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>Zero Messages</Text>
          <Text style={styles.emptySubtitle}>
            No {channel === 'BROADCAST' ? 'broadcast' : 'direct'} messages stored in local SQLite ledger.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMessages}
          keyExtractor={(item) => item.messageId}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {errorNotice && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorNotice}</Text>
        </View>
      )}

      {/* Message Composer */}
      <View style={styles.composerContainer}>
        <View style={styles.composerHeader}>
          <Text style={styles.composerLimit}>
            {inputText.length}/{LIMITS.MAX_CHAT_TEXT_CHARS}
          </Text>
        </View>

        <View style={styles.composerInputRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Type offline message (Priority 4)..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={LIMITS.MAX_CHAT_TEXT_CHARS}
            value={inputText}
            onChangeText={setInputText}
            accessibilityLabel="Message text"
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isSending) && styles.disabledSendButton
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isSending}
            accessibilityRole="button"
            accessibilityLabel="Send Message"
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md
  },
  privacyBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.warning,
    marginBottom: spacing.sm,
    alignItems: 'center'
  },
  privacyIcon: {
    fontSize: 18,
    marginRight: spacing.sm
  },
  privacyText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSizeXs,
    lineHeight: 16
  },
  privacyBold: {
    color: colors.warning,
    fontWeight: typography.fontWeightBold
  },
  channelRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 2,
    marginBottom: spacing.sm
  },
  channelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 4
  },
  activeChannelBtn: {
    backgroundColor: colors.surfaceElevated
  },
  channelBtnText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  activeChannelBtnText: {
    color: colors.info
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  recipientLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  recipientInput: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    height: 36,
    fontSize: typography.fontSizeXs
  },
  listContent: {
    paddingBottom: spacing.sm
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
    borderWidth: 1
  },
  selfBubble: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.info,
    alignSelf: 'flex-end',
    width: '85%'
  },
  peerBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    width: '85%'
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  senderText: {
    color: colors.info,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  timeText: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  bodyText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeSm,
    lineHeight: 20,
    marginBottom: 4
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  stateTag: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  directTag: {
    color: colors.warning,
    fontSize: typography.fontSizeXs,
    fontWeight: typography.fontWeightBold
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.sm
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSizeMd,
    fontWeight: typography.fontWeightBold,
    marginBottom: spacing.xs
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizeSm,
    textAlign: 'center'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: spacing.xs,
    borderRadius: 4,
    marginBottom: spacing.xs
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.fontSizeXs
  },
  composerContainer: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  composerHeader: {
    alignItems: 'flex-end',
    marginBottom: 2
  },
  composerLimit: {
    color: colors.textMuted,
    fontSize: typography.fontSizeXs
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxHeight: 80,
    fontSize: typography.fontSizeSm
  },
  sendButton: {
    backgroundColor: colors.info,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledSendButton: {
    opacity: 0.4
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeightBold,
    fontSize: typography.fontSizeSm
  }
});
