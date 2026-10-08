import { useEffect, useRef, useState } from 'react';

import type { CeoAttachmentUpload } from '../../../core/src/ceoDesk.js';
import { useCatCeo } from '../cats/catCeoClient.js';
import { catsApi } from '../cats/catsClient.js';
import { catSessionApi } from '../catTerminal/catSessionApi.js';
import { ConsoleRowView, MessageRow } from '../catTerminal/ChatConsole.js';
import { toRows } from '../catTerminal/consoleState.js';
import { EngineNotice } from '../engines/EngineNotice.js';
import { engineProblem } from '../engines/engineReadiness.js';
import { engineUi } from '../engines/engineStore.js';
import { useMoneyShown } from '../engines/money.js';
import { playDoneSound } from '../notificationSound.js';
import { sessionToken } from '../sessionToken.js';
import { ApprovalCard } from './ApprovalCard.js';
import { CEO_DESK_SESSION, ceoDeskApi } from './ceoDeskApi.js';
import { ChoiceCard } from './ChoiceCard.js';
import { ModelPickers, ModePicker } from './ComposerPickers.js';
import { ConnectorsCard } from './ConnectorsCard.js';
import { DockComposer } from './DockComposer.js';
import { CeoFace, DockHeader } from './DockHeader.js';
import {
  answered,
  DOCK_STORAGE_KEY,
  dockFrame,
  dockGeometry,
  type DockState,
  initialDock,
  parseSavedDock,
  queuedRows,
  setCollapsed,
  statusPill,
  unreadCount,
} from './dockState.js';
import { HelpCard } from './HelpCard.js';
import type { JobCardActions } from './JobCard.js';
import { QuestionCard } from './QuestionCard.js';
import { UsageRing } from './UsageRing.js';
import { useDockCommands } from './useDockCommands.js';

const READ_ONLY_TEXT = 'Open the office with `catavasia` to chat with the CEO.';

function loadDock(): DockState {
  try {
    return initialDock(parseSavedDock(window.localStorage.getItem(DOCK_STORAGE_KEY)));
  } catch {
    return initialDock(null);
  }
}

interface CeoDockProps {
  /** Changes when something asks for the dock (a click on the CEO cat). */
  expandKey: number;
  onOpenTask(taskId: string): void;
  onOpenCat(catId: string): void;
  /** An edit row (edit_prompts) links each cat's Prompt history in the Cats menu. */
  onOpenPromptHistory(catId: string): void;
}

/**
 * The CEO desk dock (standalone only): the CEO's chat on the right edge,
 * collapsible to a tab with an unread badge. The chat streams over the
 * `cat-ceo` session socket, which needs the server token; a page without it
 * shows the read-only note.
 */
export function CeoDock({ expandKey, onOpenTask, onOpenCat, onOpenPromptHistory }: CeoDockProps) {
  const showMoney = useMoneyShown(); // also re-renders when the engine status changes
  const { settings } = useCatCeo();
  const [dock, setDock] = useState(loadDock);
  const [draft, setDraft] = useState('');
  const [restored, setRestored] = useState<File[]>();
  const [gone, setGone] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevChat = useRef(dock.chat);
  const privileged = sessionToken !== null;
  const { chat, collapsed } = dock;
  const slash = useDockCommands(privileged && !gone, chat.status.folder);

  useEffect(() => {
    if (!privileged) return;
    return catSessionApi.subscribe(
      CEO_DESK_SESSION,
      (frame) => setDock((s) => dockFrame(s, frame)),
      (reason) => setGone(reason || 'closed'),
    );
  }, [privileged]);

  useEffect(() => {
    if (expandKey > 0) setDock((s) => setCollapsed(s, false));
  }, [expandKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DOCK_STORAGE_KEY,
        JSON.stringify({ collapsed: dock.collapsed, seenAt: dock.seenAt }),
      );
    } catch {
      /* no storage: the dock opens expanded next time */
    }
  }, [dock.collapsed, dock.seenAt]);

  // The open dock publishes its place: --dock-width (cat chats stand left of
  // it) and --dock-space (the office narrows by it when the window is wide).
  const [viewport, setViewport] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const geometry = dockGeometry(viewport);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--dock-width', `${collapsed ? 0 : geometry.footprint}px`);
    root.setProperty('--dock-space', `${collapsed ? 0 : geometry.push}px`);
    return () => {
      root.removeProperty('--dock-width');
      root.removeProperty('--dock-space');
    };
  }, [collapsed, geometry.footprint, geometry.push]);

  useEffect(() => {
    if (collapsed && answered(prevChat.current, chat)) void playDoneSound();
    prevChat.current = chat;
  }, [chat, collapsed]);

  // Keep the newest row in view while the chat streams.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.entries, chat.draft, chat.status.busy, collapsed, slash.card]);

  // A question of a cat or the CEO opens the dock and shows its card.
  const approvals = chat.status.approvals ?? [];
  useEffect(() => {
    if (!approvals.length) return;
    setDock((s) => setCollapsed(s, false));
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [approvals.length]);

  const name = settings?.name ?? 'CEO';
  const unread = unreadCount(dock);

  if (collapsed) {
    return (
      <button
        type="button"
        className="fixed right-0 top-1/3 w-56 py-8 pixel-panel flex flex-col items-center gap-4 cursor-pointer"
        style={{ zIndex: 44 }}
        onClick={() => setDock((s) => setCollapsed(s, false))}
        title={`Chat with ${name}`}
        data-testid="dock-tab"
      >
        <CeoFace appearance={settings?.appearance} />
        <span className="text-2xs text-text-muted">Chat</span>
        {unread > 0 && (
          <span
            className="absolute -top-10 -left-10 min-w-26 h-26 px-4 bg-danger text-white text-xs flex items-center justify-center border-2 border-bg-dark"
            data-testid="dock-unread"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  const problem = engineProblem('claude', catsApi.engineOptions('claude'));
  const queued = queuedRows(chat);
  const send = async (text: string, attachments: CeoAttachmentUpload[] = []) => {
    if (!attachments.length && slash.run(text)) return;
    await ceoDeskApi.send(text, attachments);
  };
  const jobActions: JobCardActions = {
    canControl: privileged,
    onDetails: onOpenTask,
    onOpenCat,
    showMoney,
  };
  const stop = () =>
    void ceoDeskApi.stop().then(
      (r) => {
        if (r.draft) setDraft((d) => [r.draft, d].filter(Boolean).join('\n\n'));
        // The files of the queued messages come back too (a file that fails to load is skipped).
        if (r.attachments?.length) {
          void Promise.allSettled(r.attachments.map(ceoDeskApi.fetchAttachment)).then((got) =>
            setRestored(got.flatMap((g) => (g.status === 'fulfilled' ? [g.value] : []))),
          );
        }
      },
      () => {},
    );

  return (
    <div
      className="fixed top-8 right-8 bottom-76 pixel-panel flex flex-col"
      style={{ zIndex: 44, width: geometry.width }}
      data-testid="ceo-dock"
    >
      <DockHeader
        name={name}
        appearance={settings?.appearance}
        pill={statusPill(chat)}
        folder={chat.status.folder ?? null}
        chat={chat.status.chat}
        busy={chat.status.busy}
        costUsd={showMoney ? chat.status.costUsd : undefined}
        privileged={privileged && !gone}
        stoppable={chat.status.busy || (chat.status.queued ?? 0) > 0}
        onStop={stop}
        onNewChat={() => void ceoDeskApi.newChat().catch(() => {})}
        onConnectors={() => slash.setCard('connectors')}
        onCollapse={() => setDock((s) => setCollapsed(s, true))}
      />
      <div
        ref={listRef}
        className="dock-log flex-1 min-h-0 overflow-y-auto pixel-scrollbar flex flex-col gap-12"
        data-testid="dock-log"
      >
        {(!privileged || gone) && (
          <div className="m-auto max-w-[320px] text-center prose-body text-text-muted">
            {READ_ONLY_TEXT}
          </div>
        )}
        {privileged && !gone && !chat.loaded && (
          <span className="text-text-muted text-sm">Connecting...</span>
        )}
        {privileged && chat.loaded && chat.entries.length === 0 && (
          <div className="m-auto max-w-[340px] text-center prose-body text-text-muted">
            Ask {name} anything. It answers itself, or hands the work to the team and brings back
            the result here.
          </div>
        )}
        {toRows(chat.entries).map((row, n) =>
          row.kind === 'message' && queued.has(row.entry) ? (
            <div key={n} className="self-end flex flex-col items-end gap-2 max-w-full">
              <MessageRow entry={row.entry} />
              <span className="text-2xs text-text-muted" data-testid="dock-queued">
                queued
              </span>
            </div>
          ) : (
            <ConsoleRowView
              key={n}
              row={row}
              job={jobActions}
              onOpenPromptHistory={onOpenPromptHistory}
              onLogin={() => engineUi.openLogin('claude')}
            />
          ),
        )}
        {/* The reply as Claude writes it; "thinking" until its first words. */}
        {chat.draft ? (
          <div className="contents" data-testid="dock-draft">
            <MessageRow entry={{ kind: 'text', text: chat.draft }} />
          </div>
        ) : (
          chat.status.busy && (
            <span className="self-start text-status-active text-sm pixel-pulse">
              {chat.status.busyText ?? `${name} is thinking...`}
            </span>
          )
        )}
        {approvals.map((a) =>
          a.questions ? (
            <QuestionCard key={a.id} approval={a} questions={a.questions} />
          ) : (
            <ApprovalCard key={a.id} approval={a} />
          ),
        )}
        {slash.card === 'help' && (
          <HelpCard
            commands={slash.commands}
            onPick={setDraft}
            onClose={() => slash.setCard(null)}
          />
        )}
        {slash.card === 'connectors' && <ConnectorsCard onClose={() => slash.setCard(null)} />}
        {typeof slash.card === 'object' && slash.card && (
          <ChoiceCard
            command={slash.card}
            onPick={(text) => {
              slash.setCard(null);
              // Claude Code is not ready: the pick waits in the box, as a typed command would.
              if (problem) setDraft(text);
              else void send(text).catch(() => {});
            }}
            onClose={() => slash.setCard(null)}
          />
        )}
      </div>
      {privileged && !gone && (
        <DockComposer
          draft={draft}
          onDraft={setDraft}
          onSend={send}
          commands={slash.commands}
          suggestion={chat.status.suggestion}
          onStop={chat.status.busy ? stop : undefined}
          blocked={problem ? 'Send is off until Claude Code is ready. Your draft stays.' : null}
          notice={problem ? <EngineNotice engine="claude" /> : undefined}
          restored={restored}
          onRestored={() => setRestored(undefined)}
          mode={settings && <ModePicker settings={settings} openKey={slash.opens.mode} />}
          settings={
            <>
              {settings && <ModelPickers settings={settings} openKeys={slash.opens} />}
              <UsageRing
                context={chat.status.context}
                limits={chat.status.limits}
                openKey={slash.opens.usage}
              />
            </>
          }
        />
      )}
    </div>
  );
}
