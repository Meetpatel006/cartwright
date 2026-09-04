"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Sparkles, BarChart3, Package, TrendingUp } from "lucide-react";
import { trpc } from "@/utils/trpc";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

interface ChatClientProps {
  initialChatId?: string;
}

export default function ChatClient({ initialChatId }: ChatClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId ?? null);

  const loadedChat = useQuery({
    ...trpc.merchantChat.get.queryOptions({ chatId: selectedChatId ?? "" }),
    enabled: Boolean(selectedChatId),
  });

  const create = useMutation({
    ...trpc.merchantChat.create.mutationOptions(),
    onSuccess: (data: any) => {
      setSelectedChatId(data.chat.id);
      const target = `/merchant/chat/${data.chat.id}`;
      if (pathname !== target) router.push(target as any, { scroll: false });
      qc.invalidateQueries({ queryKey: trpc.merchantChat.list.queryKey() });
    },
  });

  const send = useMutation({
    ...trpc.merchantChat.send.mutationOptions(),
    onSuccess: () => {
      if (selectedChatId) qc.invalidateQueries({ queryKey: trpc.merchantChat.get.queryKey({ chatId: selectedChatId }) });
      qc.invalidateQueries({ queryKey: trpc.merchantChat.list.queryKey() });
    },
  });

  const messages: { id: string; role: string; content: string }[] =
    (loadedChat.data?.messages as any) ?? (create.data?.messages as any) ?? [];

  const isPending = create.isPending || send.isPending;
  const status: "submitted" | "streaming" | "ready" | "error" = isPending ? "streaming" : "ready";

  // Mirror shopper-client.tsx:507 sync from initialChatId
  useEffect(() => {
    setSelectedChatId(initialChatId ?? null);
    if (!initialChatId) {
      create.reset();
      send.reset();
    }
  }, [initialChatId]);

  const handleSubmit = (msg: PromptInputMessage) => {
    const q = msg.text.trim();
    if (!q || isPending) return;
    if (!selectedChatId) create.mutate({ message: q });
    else send.mutate({ chatId: selectedChatId, message: q });
  };

  const showEmpty = !selectedChatId && messages.length === 0 && !isPending && !loadedChat.isPending;

  return (
    <div className="relative flex flex-1 h-full w-full overflow-hidden text-foreground">
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        {/* Header — title + new chat */}
        <div className="flex items-center justify-between gap-4 px-6 py-3 shrink-0">
          <h1 className="min-w-0 truncate text-sm font-bold tracking-tight">
            {(loadedChat.data?.chat as any)?.title || "Merchant Chat"}
          </h1>
          <button
            type="button"
            onClick={() => {
              setSelectedChatId(null);
              create.reset();
              send.reset();
              if (pathname !== "/merchant/chat") router.push("/merchant/chat" as any, { scroll: false });
            }}
            className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> New Chat
          </button>
        </div>

        {/* Conversation — uses ai-elements (no attachments/reasoning/sources/speech/suggestion) */}
        <Conversation className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-4xl">
            {showEmpty ? (
              <ConversationEmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="What do you want to know?"
                description="Chat with your store data — funnel, PostHog telemetry, and product performance are injected as context."
              />
            ) : (
              <>
                {loadedChat.isPending && selectedChatId && (
                  <div className="rounded-xl border border-border bg-muted p-6 text-center text-xs text-muted-foreground">
                    Loading chat…
                  </div>
                )}
                {messages.map((m) => (
                  <Message key={m.id} from={m.role as "user" | "assistant"}>
                    <MessageContent>
                      <MessageResponse>{m.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))}
                {isPending && (
                  <Message from="assistant">
                    <MessageContent>
                      <span className="text-xs text-muted-foreground animate-pulse">Thinking…</span>
                    </MessageContent>
                  </Message>
                )}
                {loadedChat.isError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                    {String(loadedChat.error)}
                  </div>
                )}
                {create.isError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                    {String((create.error as unknown as Error).message ?? create.error)}
                  </div>
                )}
                {send.isError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                    {String((send.error as unknown as Error).message ?? send.error)}
                  </div>
                )}
              </>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Prompt input — ai-elements PromptInput only (no attachments/model-selector/speech) */}
        <div className="shrink-0 bg-background">
          {showEmpty && (
            <div className="mx-auto flex max-w-4xl flex-wrap gap-2 px-4 pt-3">
              {[
                { label: "Summarize funnel", icon: BarChart3, q: "Summarize my conversion funnel and where I'm losing customers" },
                { label: "Top products", icon: Package, q: "What are my top products and their conversion?" },
                { label: "Zero-result searches", icon: TrendingUp, q: "What searches are returning zero results?" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => handleSubmit({ text: s.q, files: [] })}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Icon className="h-3.5 w-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mx-auto w-full max-w-4xl px-4 py-2">
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea placeholder="Ask about your store, funnel, or products..." />
              </PromptInputBody>
              <PromptInputFooter>
                <div />
                <PromptInputSubmit
                  status={status}
                  disabled={isPending}
                  className="rounded-md"
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
