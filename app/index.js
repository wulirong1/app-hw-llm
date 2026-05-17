import { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const API_URL = getApiUrl();
const CHAT_HISTORY_KEY = "chatmate.history.v3";
const CHAT_ROOMS_KEY = "chatmate.rooms.v3";

const lightTheme = {
  background: "#F6F7FF",
  surface: "#FFFFFF",
  text: "#1E2433",
  muted: "#7C8292",
  border: "#E3E6F0",
  primary: "#6457F4",
  primaryText: "#FFFFFF",
  assistantBubble: "#FFFFFF",
  input: "#FFFFFF",
  shadow: "#D9DDF1",
};

export default function Page() {
  const scrollViewRef = useRef(null);
  const hasLoadedHistoryRef = useRef(false);
  const [chats, setChats] = useState(() => [createEmptyChat()]);
  const [activeChatId, setActiveChatId] = useState(() => chats[0].id);
  const [draft, setDraft] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingChatId, setLoadingChatId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const theme = lightTheme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];

  useEffect(() => {
    async function loadChatHistory() {
      try {
        const savedChatState = await AsyncStorage.getItem(CHAT_ROOMS_KEY);

        if (savedChatState) {
          const parsedState = JSON.parse(savedChatState);
          const savedChats = Array.isArray(parsedState?.chats)
            ? parsedState.chats.filter(isValidChat)
            : [];

          if (savedChats.length > 0) {
            setChats(savedChats);
            setActiveChatId(
              savedChats.some((chat) => chat.id === parsedState.activeChatId)
                ? parsedState.activeChatId
                : savedChats[0].id,
            );
          }
        } else {
          const savedMessages = await AsyncStorage.getItem(CHAT_HISTORY_KEY);

          if (!savedMessages) {
            return;
          }

          const parsedMessages = JSON.parse(savedMessages);

          if (Array.isArray(parsedMessages)) {
            const migratedMessages = parsedMessages.filter(isValidMessage);
            const migratedChat = {
              ...createEmptyChat(),
              title: getChatTitle(migratedMessages),
              messages: migratedMessages,
            };

            setChats([migratedChat]);
            setActiveChatId(migratedChat.id);
          }
        }
      } catch {
        setErrorMessage("讀取歷史聊天失敗，請稍後再試。");
      } finally {
        hasLoadedHistoryRef.current = true;
      }
    }

    loadChatHistory();
  }, []);

  useEffect(() => {
    async function saveChatHistory() {
      if (!hasLoadedHistoryRef.current) {
        return;
      }

      try {
        await AsyncStorage.setItem(
          CHAT_ROOMS_KEY,
          JSON.stringify({ chats, activeChatId }),
        );
      } catch {
        setErrorMessage("儲存聊天記錄失敗，請確認裝置儲存空間。");
      }
    }

    saveChatHistory();
  }, [activeChatId, chats]);

  function scrollToLatestMessage(animated = true) {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    if (messages.length > 0) {
      scrollToLatestMessage();
    }
  }, [activeChatId, messages.length, isLoading]);

  useEffect(() => {
    const eventName =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(eventName, () => {
      scrollToLatestMessage();
    });

    return () => subscription.remove();
  }, []);

  async function sendMessage() {
    const text = draft.trim();

    if (!text || isLoading) {
      return;
    }

    const chatId = activeChat.id;
    const userMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: text,
      time: getCurrentTime(),
    };
    const nextMessages = [...messages, userMessage];

    updateChatMessages(chatId, nextMessages);
    setDraft("");
    setErrorMessage("");
    setIsLoading(true);
    setLoadingChatId(chatId);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "聊天服務暫時無法使用");
      }

      updateChatMessages(chatId, [
        ...nextMessages,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply || "我暫時沒有取得回覆，請再試一次。",
          time: getCurrentTime(),
        },
      ]);
    } catch (error) {
      setErrorMessage(error.message || "聊天服務暫時無法使用");
    } finally {
      setIsLoading(false);
      setLoadingChatId("");
    }
  }

  function updateChatMessages(chatId, nextMessages) {
    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }

        return {
          ...chat,
          title: getChatTitle(nextMessages),
          messages: nextMessages,
          updatedAt: Date.now(),
        };
      }),
    );
  }

  function createChat() {
    const nextChat = createEmptyChat();

    setChats((currentChats) => [nextChat, ...currentChats]);
    setActiveChatId(nextChat.id);
    setDraft("");
    setErrorMessage("");
    setIsMenuOpen(false);
  }

  function selectChat(chatId) {
    setActiveChatId(chatId);
    setDraft("");
    setErrorMessage("");
    setIsMenuOpen(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <ChatHeader
          styles={styles}
          onOpenMenu={() => setIsMenuOpen(true)}
        />

        {isMenuOpen ? (
          <ChatMenu
            activeChatId={activeChatId}
            chats={chats}
            styles={styles}
            onClose={() => setIsMenuOpen(false)}
            onCreateChat={createChat}
            onSelectChat={selectChat}
          />
        ) : null}

        {messages.length === 0 ? (
          <EmptyState styles={styles} />
        ) : (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollToLatestMessage()}
            showsVerticalScrollIndicator={false}
            style={styles.messageScroller}
          >
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                styles={styles}
              />
            ))}
            {isLoading && loadingChatId === activeChatId ? (
              <TypingBubble styles={styles} />
            ) : null}
          </ScrollView>
        )}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            placeholder="輸入訊息..."
            placeholderTextColor={theme.muted}
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
            editable={!isLoading}
            returnKeyType="send"
          />
          <Pressable
            disabled={!draft.trim() || isLoading}
            style={[
              styles.sendButton,
              !draft.trim() || isLoading ? styles.sendButtonDisabled : null,
            ]}
            onPress={sendMessage}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatHeader({ styles, onOpenMenu }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.menuButton} onPress={onOpenMenu}>
        <Text style={styles.menuButtonText}>☰</Text>
      </Pressable>
      <Text style={styles.headerTitle}>牙齒</Text>
    </View>
  );
}

function ChatMenu({
  activeChatId,
  chats,
  styles,
  onClose,
  onCreateChat,
  onSelectChat,
}) {
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <View style={styles.menuLayer}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} />
      <View style={styles.menuPanel}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>聊天室</Text>
          <Pressable style={styles.newChatButton} onPress={onCreateChat}>
            <Text style={styles.newChatText}>＋ 新聊天</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
        >
          {sortedChats.map((chat) => (
            <Pressable
              key={chat.id}
              style={[
                styles.chatListItem,
                chat.id === activeChatId ? styles.chatListItemActive : null,
              ]}
              onPress={() => onSelectChat(chat.id)}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.chatListTitle,
                  chat.id === activeChatId ? styles.chatListTitleActive : null,
                ]}
              >
                {chat.title}
              </Text>
              <Text numberOfLines={1} style={styles.chatListPreview}>
                {getChatPreview(chat)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function EmptyState({ styles }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.logoCluster}>
        <View style={styles.logoBubblePrimary}>
          <Text style={styles.logoDots}>•••</Text>
        </View>
        <View style={styles.logoBubbleSecondary}>
          <Text style={styles.logoDotsMuted}>•••</Text>
        </View>
      </View>
      <Text style={styles.emptyTitle}>開始一段對話吧！</Text>
      <Text style={styles.emptySubtitle}>與 AI 聊天，獲得答案、靈感或建議。</Text>
    </View>
  );
}

function ChatBubble({ message, styles }) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : null]}>
      {!isUser ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>●●</Text>
        </View>
      ) : null}
      <View style={styles.messageStack}>
        <View style={[styles.bubble, isUser ? styles.userBubble : null]}>
          <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : null]}>
            {message.content}
          </Text>
        </View>
        <Text style={[styles.timeText, isUser ? styles.userTimeText : null]}>
          {message.time}
        </Text>
      </View>
    </View>
  );
}

function TypingBubble({ styles }) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>●●</Text>
      </View>
      <View style={styles.typingBubble}>
        <Text style={styles.typingText}>牙齒正在回覆...</Text>
      </View>
    </View>
  );
}

function getApiUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `http://${window.location.hostname}:3001/api/chat`;
  }

  return "http://localhost:3001/api/chat";
}

function getCurrentTime() {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function isValidMessage(message) {
  return (
    message &&
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.time === "string"
  );
}

function createEmptyChat() {
  const now = Date.now();

  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: "新的聊天室",
    messages: [],
    updatedAt: now,
  };
}

function getChatTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content?.trim();

  if (!title) {
    return "新的聊天室";
  }

  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}

function getChatPreview(chat) {
  const lastMessage = chat.messages[chat.messages.length - 1];

  return lastMessage?.content || "尚未開始對話";
}

function isValidChat(chat) {
  return (
    chat &&
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isValidMessage)
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      height: 64,
      alignItems: "center",
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 18,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
      ...StyleSheet.absoluteFillObject,
      height: 64,
      lineHeight: 64,
      zIndex: 0,
    },
    menuButton: {
      alignItems: "center",
      height: 40,
      justifyContent: "center",
      width: 40,
      zIndex: 1,
    },
    menuButtonText: {
      color: theme.primary,
      fontSize: 24,
      fontWeight: "700",
      lineHeight: 28,
    },
    menuLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(18, 24, 40, 0.22)",
    },
    menuPanel: {
      backgroundColor: theme.surface,
      borderBottomRightRadius: 24,
      borderRightColor: theme.border,
      borderRightWidth: 1,
      borderTopRightRadius: 24,
      bottom: 0,
      left: 0,
      paddingHorizontal: 16,
      paddingTop: 22,
      position: "absolute",
      shadowColor: theme.shadow,
      shadowOffset: { width: 8, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 24,
      top: 0,
      width: 300,
    },
    menuHeader: {
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 14,
      paddingBottom: 16,
    },
    menuTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "800",
    },
    newChatButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 16,
      height: 44,
      justifyContent: "center",
    },
    newChatText: {
      color: theme.primaryText,
      fontSize: 15,
      fontWeight: "800",
    },
    chatList: {
      gap: 10,
      paddingBottom: 22,
      paddingTop: 16,
    },
    chatListItem: {
      backgroundColor: "#F7F8FF",
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    chatListItemActive: {
      backgroundColor: "#EFEEFF",
      borderColor: theme.primary,
    },
    chatListTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "800",
      marginBottom: 5,
    },
    chatListTitleActive: {
      color: theme.primary,
    },
    chatListPreview: {
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    emptyState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 36,
    },
    logoCluster: {
      height: 86,
      marginBottom: 22,
      width: 128,
    },
    logoBubblePrimary: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 26,
      height: 58,
      justifyContent: "center",
      left: 18,
      position: "absolute",
      top: 4,
      transform: [{ rotate: "-8deg" }],
      width: 70,
    },
    logoBubbleSecondary: {
      alignItems: "center",
      backgroundColor: "#DCE1EE",
      borderRadius: 23,
      height: 50,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 28,
      transform: [{ rotate: "8deg" }],
      width: 62,
    },
    logoDots: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: 1,
    },
    logoDotsMuted: {
      color: "#F7F8FF",
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: 1,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 10,
    },
    emptySubtitle: {
      color: theme.muted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    messageList: {
      gap: 18,
      paddingBottom: 22,
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    messageScroller: {
      flex: 1,
    },
    messageRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
    },
    userRow: {
      justifyContent: "flex-end",
    },
    avatar: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 15,
      height: 30,
      justifyContent: "center",
      marginTop: 4,
      width: 30,
    },
    avatarText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: -1,
    },
    messageStack: {
      maxWidth: "78%",
    },
    bubble: {
      backgroundColor: theme.assistantBubble,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    userBubble: {
      backgroundColor: theme.primary,
      borderTopRightRadius: 6,
    },
    bubbleText: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 21,
    },
    userBubbleText: {
      color: theme.primaryText,
    },
    timeText: {
      alignSelf: "flex-end",
      color: theme.muted,
      fontSize: 11,
      marginTop: 5,
    },
    userTimeText: {
      marginRight: 2,
    },
    typingBubble: {
      backgroundColor: theme.assistantBubble,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    typingText: {
      color: theme.muted,
      fontSize: 14,
      lineHeight: 21,
    },
    errorBox: {
      backgroundColor: "#FFF0F1",
      borderColor: "#FFD1D6",
      borderRadius: 12,
      borderWidth: 1,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    errorText: {
      color: "#B42333",
      fontSize: 13,
      lineHeight: 18,
    },
    composer: {
      alignItems: "center",
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 10,
      paddingBottom: 14,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    input: {
      backgroundColor: theme.input,
      borderColor: theme.border,
      borderRadius: 17,
      borderWidth: 1,
      color: theme.text,
      flex: 1,
      fontSize: 14,
      height: 46,
      paddingHorizontal: 18,
    },
    sendButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 23,
      height: 46,
      justifyContent: "center",
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      width: 46,
    },
    sendButtonDisabled: {
      opacity: 0.45,
    },
    sendText: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "700",
      lineHeight: 26,
    },
  });
}
