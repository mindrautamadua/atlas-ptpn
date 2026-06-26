'use client'

/**
 * Workspace provider for the Next.js port.
 *
 * Surfaces the fields consumed by HomeView, ProgramsView, WorkboardView,
 * TaskDetailView, AssignmentsView, MeetingDetail, PresenceView, dan (port
 * 2026-06-26) ChannelsViewWrapper — slice Channels + realtime polling.
 *
 * Data overview via GET /api/workspace/overview. Channels via GET /channels;
 * presence GET /users/presence; pesan GET /channels/{id}/messages. Event
 * realtime via RealtimeProvider (polling /realtime/poll) → useRealtimeEvents.
 */

import {
  createContext, useCallback, useEffect, useMemo, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react'
import { usePage, router } from '@inertiajs/react'
import type {
  AuthUser, Program, Kpi, ApmsKpi, DashboardPayload, ProgramSummaryPayload,
  Task, Blocker, PresenceStatus, PresenceUser, TaskDetail,
  ChannelSummary, ChannelMember, ChannelMessage, NotificationItem,
} from '../types'
import { api } from '../lib/api'
import { usePresencePing } from '../hooks/usePresencePing'
import { useRealtimeEvents } from '../hooks/useRealtimeEvents'
import { useStableCallback } from '../hooks/useStableCallback'

// WorkGroup shape — copied VERBATIM from source contexts/workspace.tsx.
export type WorkGroup = { status: string; count: number; items: Task[] }
type TasksResponse = { groups: WorkGroup[] }
type CollectionResponse<T> = { data: T[]; total?: number }
type ChannelDetailResponse = { channel: { id: number; name: string; type: 'PUBLIC' | 'PRIVATE' }; members: ChannelMember[] }

// ── Helpers (copied VERBATIM from the original contexts/workspace.tsx) ────────
const normalizeHealthStatus = (value?: string): 'GREEN' | 'YELLOW' | 'RED' =>
  value === 'GREEN' || value === 'YELLOW' || value === 'RED' ? value : 'YELLOW'

const formatStatusLabel = (value?: string): string => {
  if (!value) return 'Not set'
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// Copied VERBATIM from the source contexts/workspace.tsx.
function appendComposerSnippet(
  setter: Dispatch<SetStateAction<string>>,
  snippet: string,
) {
  setter((current) => {
    if (!current.trim()) return snippet
    return `${current.trimEnd()}\n\n${snippet}`
  })
}

function realtimePayload<T>(data: unknown): T | null {
  return data && typeof data === 'object' ? (data as T) : null
}

export type OverviewStatus = { loading: boolean; refreshing: boolean; message: string | null }

// ── Context value type ─────────────────────────────────────────────────────
export interface WorkspaceContextValue {
  currentUser: AuthUser | null
  programs: Program[]
  kpis: Kpi[]
  dashboard: DashboardPayload | null
  apmsKpis: ApmsKpi[]
  programSummary: ProgramSummaryPayload | null
  selectedProgramId: number | null
  overviewStatus: OverviewStatus
  loadOverview: (mode?: 'initial' | 'refresh') => Promise<void>
  openProgramWorkspace: (programId: number) => void
  normalizeHealthStatus: (value?: string) => 'GREEN' | 'YELLOW' | 'RED'
  formatStatusLabel: (value?: string) => string
  // ── Workboard slice ──
  workGroups: WorkGroup[]
  workGroupsStatus: { loading: boolean; failed: boolean }
  reloadTasks: () => Promise<void>
  blockers: Blocker[]
  boardStatus: { saving: boolean; message: string | null }
  boardOnOpen: { forceShowAll: boolean; filterProgramId: number | null } | null
  clearBoardOnOpen: () => void
  // ── Task detail slice ──
  taskDetail: TaskDetail | null
  setTaskDetail: Dispatch<SetStateAction<TaskDetail | null>>
  selectedTaskId: number | null
  setSelectedTaskId: Dispatch<SetStateAction<number | null>>
  appendComposerSnippet: (setter: Dispatch<SetStateAction<string>>, snippet: string) => void
  // ── Assignment slice ──
  assignmentRefreshTick: number
  // ── Meeting slice ──
  meetingRefreshKey: number
  // ── Presence slice ──
  presence: PresenceUser[]
  setPresence: Dispatch<SetStateAction<PresenceUser[]>>
  presenceDraft: { status: PresenceStatus; statusEmoji: string; statusMessage: string }
  setPresenceDraft: Dispatch<SetStateAction<{ status: PresenceStatus; statusEmoji: string; statusMessage: string }>>
  // ── Channels slice ──
  channels: ChannelSummary[]
  setChannels: Dispatch<SetStateAction<ChannelSummary[]>>
  selectedChannelId: number | null
  setSelectedChannelId: Dispatch<SetStateAction<number | null>>
  selectedThreadId: number | null
  setSelectedThreadId: Dispatch<SetStateAction<number | null>>
  selectedChannel: ChannelSummary | null
  channelMembers: ChannelMember[]
  messages: ChannelMessage[]
  setMessages: Dispatch<SetStateAction<ChannelMessage[]>>
  threadParent: ChannelMessage | null
  threadReplies: ChannelMessage[]
  setThreadReplies: Dispatch<SetStateAction<ChannelMessage[]>>
  channelStatus: { loading: boolean; message: string | null }
  setChannelStatus: Dispatch<SetStateAction<{ loading: boolean; message: string | null }>>
  refreshChannel: (channelId: number, threadId?: number | null, silent?: boolean) => Promise<void>
  totalUnreadChannels: number
  typingUsers: Record<number, { userId: number; userName: string }[]>
  sendTyping: (channelId: number) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue>(null!)

type OverviewResponse = {
  programs: Program[]
  programSummary: ProgramSummaryPayload | null
  dashboard: DashboardPayload | null
  apmsKpis: ApmsKpi[]
}

const LS_CHANNEL_KEY = 'atlas:lastChannelId'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { props } = usePage<{ auth?: { user?: AuthUser | null } }>()
  const currentUser = props.auth?.user ?? null
  const enabled = currentUser != null

  const [programs, setPrograms] = useState<Program[]>([])
  const [kpis] = useState<Kpi[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [apmsKpis, setApmsKpis] = useState<ApmsKpi[]>([])
  const [programSummary, setProgramSummary] = useState<ProgramSummaryPayload | null>(null)
  const [selectedProgramId] = useState<number | null>(null)
  const [overviewStatus, setOverviewStatus] = useState<OverviewStatus>({ loading: true, refreshing: false, message: null })

  // ── Workboard slice ──
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([])
  const [workGroupsStatus, setWorkGroupsStatus] = useState<{ loading: boolean; failed: boolean }>({ loading: true, failed: false })
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [boardStatus] = useState<{ saving: boolean; message: string | null }>({ saving: false, message: null })
  const [boardOnOpen, setBoardOnOpen] = useState<{ forceShowAll: boolean; filterProgramId: number | null } | null>(null)
  const clearBoardOnOpen = useCallback(() => setBoardOnOpen(null), [])

  // ── Task detail slice ──
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  // ── Assignment slice — poll ringan pengganti realtime broadcast ──
  const [assignmentRefreshTick, setAssignmentRefreshTick] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPenugasan = () => window.location.pathname === '/penugasan'
    if (!onPenugasan()) return
    const t = setInterval(() => {
      if (onPenugasan()) setAssignmentRefreshTick((n) => n + 1)
    }, 4000)
    return () => clearInterval(t)
  }, [])

  // ── Presence slice ──
  usePresencePing()

  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [presenceDraft, setPresenceDraft] = useState<{ status: PresenceStatus; statusEmoji: string; statusMessage: string }>({
    status: 'ONLINE',
    statusEmoji: '',
    statusMessage: '',
  })

  // ── Channels slice ──
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [selectedChannelId, setSelectedChannelIdRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = window.localStorage.getItem(LS_CHANNEL_KEY)
    return saved ? Number(saved) : null
  })
  const setSelectedChannelId: Dispatch<SetStateAction<number | null>> = useCallback((value) => {
    setSelectedChannelIdRaw((prev) => {
      const next = typeof value === 'function' ? (value as (p: number | null) => number | null)(prev) : value
      if (typeof window !== 'undefined') {
        if (next != null) window.localStorage.setItem(LS_CHANNEL_KEY, String(next))
        else window.localStorage.removeItem(LS_CHANNEL_KEY)
      }
      return next
    })
  }, [])
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([])
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [threadParent, setThreadParent] = useState<ChannelMessage | null>(null)
  const [threadReplies, setThreadReplies] = useState<ChannelMessage[]>([])
  const [channelStatus, setChannelStatus] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null })
  const [channelsLoaded, setChannelsLoaded] = useState(false)
  const [, setNotifications] = useState<NotificationItem[]>([])

  const [typingUsers, setTypingUsers] = useState<Record<number, { userId: number; userName: string }[]>>({})
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedChannelIdRef = useRef<number | null>(null)
  useEffect(() => { selectedChannelIdRef.current = selectedChannelId }, [selectedChannelId])

  // ── Derived ──
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  )
  const totalUnreadChannels = useMemo(
    () => channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [channels],
  )

  const loadPresence = useStableCallback(async () => {
    try {
      const v = await api.get<{ users: PresenceUser[] }>('/users/presence')
      setPresence(Array.isArray(v.users) ? v.users : [])
    } catch { /* non-fatal — keep last snapshot */ }
  })

  // Fetch + poll presence saat halaman /presence aktif (mirror route-scoped loader).
  // Channels juga butuh presence (di-load via loadOverview); realtime menjaganya segar.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.pathname.startsWith('/presence')) return
    let alive = true
    const load = async () => { if (alive) await loadPresence() }
    void load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sinkronkan draft sekali dari status asli user begitu presence pertama tiba.
  const presenceDraftSyncedRef = useRef(false)
  useEffect(() => {
    if (presenceDraftSyncedRef.current || !currentUser) return
    const me = presence.find((p) => p.userId === currentUser.id)
    if (!me) return
    presenceDraftSyncedRef.current = true
    setPresenceDraft({
      status: me.status === 'OFFLINE' ? 'ONLINE' : me.status,
      statusEmoji: me.statusEmoji ?? '',
      statusMessage: me.statusMessage ?? '',
    })
  }, [presence, currentUser])

  const inflight = useRef<Promise<void> | null>(null)

  const reloadTasks = useCallback(async () => {
    setWorkGroupsStatus({ loading: true, failed: false })
    try {
      const v = await api.get<TasksResponse>('/tasks', { timeoutMs: 30_000 })
      setWorkGroups(Array.isArray(v.groups) ? v.groups : [])
      setWorkGroupsStatus({ loading: false, failed: false })
    } catch {
      setWorkGroupsStatus({ loading: false, failed: true })
    }
  }, [])

  // ── Channels loaders ──
  const loadChannels = useStableCallback(async () => {
    try {
      // /channels/list (bukan /channels): di Next.js URL halaman /channels bentrok
      // dgn route handler — koleksi dipindah ke /channels/list (lihat next route).
      const v = await api.get<CollectionResponse<ChannelSummary>>('/channels/list')
      const loaded = v.data
      const patched = loaded.map((c) =>
        c.id === selectedChannelIdRef.current ? { ...c, unreadCount: 0 } : c,
      )
      setChannels(patched)
      setSelectedChannelId((cur) => {
        if (cur != null && loaded.some((c) => c.id === cur)) return cur
        return loaded[0]?.id ?? null
      })
    } finally {
      setChannelsLoaded(true)
    }
  })

  const loadOverview = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (inflight.current) return inflight.current
    setOverviewStatus({ loading: mode === 'initial', refreshing: mode === 'refresh', message: null })
    const path = typeof window !== 'undefined' ? window.location.pathname : '/'
    const onExecution = path === '/execution' || path.startsWith('/execution/')
    const onChannels = path === '/channels' || path.startsWith('/channels/')
    const job = (async () => {
      try {
        const overviewJob = (async () => {
          const res = await fetch('/api/workspace/overview', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          })
          if (!res.ok) throw new Error(`overview ${res.status}`)
          const data = (await res.json()) as OverviewResponse
          setPrograms(Array.isArray(data.programs) ? data.programs : [])
          setProgramSummary(data.programSummary ?? null)
          setDashboard(data.dashboard ?? null)
          setApmsKpis(Array.isArray(data.apmsKpis) ? data.apmsKpis : [])
        })()

        // Channels = kebutuhan shell global (badge unread) → selalu dimuat.
        const channelsJob = loadChannels()

        const boardJob = onExecution || onChannels ? (async () => {
          setWorkGroupsStatus((cur) => ({ ...cur, loading: true, failed: false }))
          try {
            const v = await api.get<TasksResponse>('/tasks', { timeoutMs: 30_000 })
            setWorkGroups(Array.isArray(v.groups) ? v.groups : [])
            setWorkGroupsStatus({ loading: false, failed: false })
          } catch {
            setWorkGroupsStatus({ loading: false, failed: true })
          }
          if (onExecution) {
            try {
              const b = await api.get<CollectionResponse<Blocker>>('/blockers')
              setBlockers(Array.isArray(b.data) ? b.data : [])
            } catch { /* non-critical */ }
          }
        })() : Promise.resolve()

        const presenceJob = onChannels ? loadPresence() : Promise.resolve()

        await Promise.all([overviewJob, channelsJob, boardJob, presenceJob])
        setOverviewStatus({ loading: false, refreshing: false, message: null })
      } catch {
        setOverviewStatus({ loading: false, refreshing: false, message: 'Workspace failed to load. Try refreshing the page.' })
      } finally {
        setChannelsLoaded(true)
        inflight.current = null
      }
    })()
    inflight.current = job
    return job
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadOverview('initial')
  }, [loadOverview])

  // ── refreshChannel (VERBATIM port — feed prioritas, member/thread non-blocking) ──
  const refreshChannel = useStableCallback(async (
    channelId: number,
    threadId?: number | null,
    silent = false,
  ) => {
    if (!silent) setChannelStatus({ loading: true, message: null })
    const isStale = () => channelId !== selectedChannelIdRef.current

    const msgsP = api.get<{ data: ChannelMessage[]; total: number }>(
      `/channels/${channelId}/messages?limit=40&offset=0&includeThreads=true`,
    ).then((msgs) => {
      if (isStale()) return false
      setMessages(msgs.data ?? [])
      return true
    }).catch(() => false)

    void api.get<ChannelDetailResponse>(`/channels/${channelId}`)
      .then((detail) => { if (!isStale()) setChannelMembers(detail.members) })
      .catch(() => { /* noop */ })

    const resolvedThread = threadId ?? selectedThreadId
    if (resolvedThread) {
      void api.get<{ data: { parent: ChannelMessage; replies: ChannelMessage[] } }>(
        `/channels/${channelId}/messages/${resolvedThread}/thread`,
      ).then((threadData) => {
        if (isStale()) return
        setThreadParent(threadData.data?.parent ?? null)
        setThreadReplies(threadData.data?.replies ?? [])
      }).catch(() => { /* noop */ })
    } else {
      setThreadParent(null)
      setThreadReplies([])
    }

    const ok = await msgsP
    if (isStale()) return
    if (!silent) setChannelStatus({ loading: false, message: ok ? null : 'Channel tidak dapat dimuat.' })
  })

  const openProgramWorkspace = useCallback((programId: number) => {
    router.visit(`/programs/${programId}`)
  }, [])

  // ── Typing ──
  const sendTyping = useMemo(() => {
    let lastFired = 0
    return (channelId: number) => {
      const now = Date.now()
      if (now - lastFired < 2000) return
      lastFired = now
      void api.post(`/realtime/typing/${channelId}`, {})
    }
  }, [])

  // ── Realtime event handlers (VERBATIM port dari atlas-php workspace.tsx) ──
  const handleMessageCreated = useStableCallback((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string } } }) => {
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
    }
    const onChannelsPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/channels')
    const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    const isViewing = onChannelsPage && tabVisible && event.channelId === selectedChannelIdRef.current
    const isOwnMessage = currentUser != null && msg.userId === currentUser.id

    const typingKey = `${event.channelId}:${msg.userId}`
    const typingTimer = typingTimersRef.current.get(typingKey)
    if (typingTimer) { clearTimeout(typingTimer); typingTimersRef.current.delete(typingKey) }
    setTypingUsers((prev) => {
      const current = prev[event.channelId]
      if (!current?.some((u) => u.userId === msg.userId)) return prev
      const next = current.filter((u) => u.userId !== msg.userId)
      if (next.length === 0) { const { [event.channelId]: _omit, ...rest } = prev; return rest }
      return { ...prev, [event.channelId]: next }
    })

    setChannels((prev) => prev.map((c) =>
      c.id === event.channelId
        ? {
            ...c,
            unreadCount: isViewing || isOwnMessage ? c.unreadCount : c.unreadCount + 1,
            lastMessage: {
              id: event.message.id,
              userId: event.message.userId,
              content: event.message.content,
              createdAt: event.message.createdAt,
            },
          }
        : c,
    ))

    if (!isViewing) return

    setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
    markReadTimerRef.current = setTimeout(() => {
      void api.put(`/channels/${event.channelId}/read`).catch(() => {})
    }, 2000)
  })

  const handleMessageDeleted = useStableCallback((event: { channelId: number; messageId: number; parentMessageId?: number; newReplyCount?: number }) => {
    if (event.channelId !== selectedChannelIdRef.current) return
    setMessages((prev) => prev
      .filter((m) => m.id !== event.messageId)
      .map((m) =>
        event.parentMessageId && typeof event.newReplyCount === 'number' && m.id === event.parentMessageId
          ? { ...m, replyCount: event.newReplyCount }
          : m))
    setThreadReplies((prev) => prev.filter((r) => r.id !== event.messageId))
    if (event.parentMessageId && typeof event.newReplyCount === 'number') {
      const newReplyCount = event.newReplyCount
      setThreadParent((prev) => prev && prev.id === event.parentMessageId ? { ...prev, replyCount: newReplyCount } : prev)
    }
    if (threadParent?.id === event.messageId || selectedThreadId === event.messageId) {
      setThreadParent(null); setThreadReplies([]); setSelectedThreadId(null)
    }
  })

  const handleReactionChanged = useStableCallback((event: { channelId: number; messageId: number; reactions: Record<string, number[]> }) => {
    if (event.channelId !== selectedChannelIdRef.current) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, reactions: event.reactions } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    setThreadParent((p) => p && p.id === event.messageId ? { ...p, reactions: event.reactions } : p)
  })

  const handleThreadReply = useStableCallback((event: { channelId: number; parentId: number; reply: ChannelMessage; newReplyCount: number }) => {
    if (event.channelId !== selectedChannelIdRef.current) return
    setMessages((prev) => prev.map((m) => m.id === event.parentId ? { ...m, replyCount: event.newReplyCount } : m))
    if (selectedThreadId === event.parentId) {
      setThreadReplies((prev) => prev.some((r) => r.id === event.reply.id) ? prev : [...prev, event.reply])
    }
  })

  const handleMessageUpdated = useStableCallback((event: { channelId: number; message: ChannelMessage & { author?: { name?: string; roleType?: string } } }) => {
    const msg: ChannelMessage = {
      ...event.message,
      reactions: event.message.reactions ?? {},
      authorName: event.message.authorName ?? event.message.author?.name,
      authorRole: event.message.authorRole ?? event.message.author?.roleType,
    }
    setChannels((prev) => prev.map((channel) => {
      if (channel.id !== event.channelId || channel.lastMessage?.id !== msg.id) return channel
      return { ...channel, lastMessage: { id: msg.id, userId: msg.userId, content: msg.content, createdAt: msg.createdAt } }
    }))
    if (event.channelId !== selectedChannelIdRef.current) return
    const patch = (m: ChannelMessage) => m.id === msg.id ? { ...m, ...msg } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    setThreadParent((p) => p && p.id === msg.id ? { ...p, ...msg } : p)
  })

  const handleMessagePinned = useStableCallback((event: { channelId: number; messageId: number; isPinned: boolean }) => {
    if (event.channelId !== selectedChannelIdRef.current) return
    const patch = (m: ChannelMessage) => m.id === event.messageId ? { ...m, isPinned: event.isPinned } : m
    setMessages((prev) => prev.map(patch))
    setThreadReplies((prev) => prev.map(patch))
    setThreadParent((prev) => prev && prev.id === event.messageId ? { ...prev, isPinned: event.isPinned } : prev)
  })

  const handleChannelCreated = useStableCallback((event: { channel: ChannelSummary }) => {
    setChannels((prev) => {
      if (prev.some((c) => c.id === event.channel.id)) return prev
      const isDm = event.channel.isDirectMessage ?? /^dm-\d+-\d+$/.test(event.channel.name ?? '')
      return [...prev, {
        ...event.channel,
        unreadCount: event.channel.unreadCount ?? 0,
        memberCount: event.channel.memberCount ?? (isDm ? 2 : 1),
        isStarred: event.channel.isStarred ?? false,
        canManageMembers: event.channel.canManageMembers ?? false,
        isDirectMessage: isDm,
      }]
    })
  })

  const handleChannelUpdated = useStableCallback((event: { channel: ChannelSummary }) => {
    setChannels((prev) => prev.map((c) => c.id === event.channel.id ? { ...c, ...event.channel } : c))
  })

  const handleChannelArchived = useStableCallback((event: { channelId: number }) => {
    setChannels((prev) => prev.filter((c) => c.id !== event.channelId))
    if (selectedChannelIdRef.current === event.channelId) setSelectedChannelId(null)
  })

  const handleTypingStart = useStableCallback((event: { channelId: number; userId: number; userName: string }) => {
    const key = `${event.channelId}:${event.userId}`
    const existing = typingTimersRef.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      typingTimersRef.current.delete(key)
      setTypingUsers((prev) => {
        const current = prev[event.channelId] ?? []
        const next = current.filter((u) => u.userId !== event.userId)
        if (next.length === 0) { const { [event.channelId]: _omit, ...rest } = prev; return rest }
        return { ...prev, [event.channelId]: next }
      })
    }, 5000)
    typingTimersRef.current.set(key, timer)
    setTypingUsers((prev) => {
      const current = prev[event.channelId] ?? []
      if (current.some((u) => u.userId === event.userId)) return prev
      return { ...prev, [event.channelId]: [...current, { userId: event.userId, userName: event.userName }] }
    })
  })

  const handleNotificationCreated = useStableCallback((event: { notification: NotificationItem }) => {
    setNotifications((prev) => prev.some((n) => n.id === event.notification.id) ? prev : [event.notification, ...prev])
  })

  const handlePresenceUpdated = useStableCallback((event: { userId: number; status: string; statusEmoji?: string; statusMessage?: string; lastActivityAt: string }) => {
    setPresence((prev) => prev.map((p) => {
      if (p.userId !== event.userId) return p
      return {
        ...p,
        status: event.status as PresenceUser['status'],
        ...(event.statusEmoji !== undefined ? { statusEmoji: event.statusEmoji } : {}),
        ...(event.statusMessage !== undefined ? { statusMessage: event.statusMessage } : {}),
        lastActivityAt: event.lastActivityAt,
      }
    }))
  })

  const handlePresenceActivity = useStableCallback((event: { userId: number; lastActivityAt: string }) => {
    setPresence((prev) => prev.map((p) => p.userId === event.userId ? { ...p, lastActivityAt: event.lastActivityAt } : p))
  })

  useRealtimeEvents({
    'channel:message:created': (data) => { const e = realtimePayload<{ channelId: number; message: ChannelMessage }>(data); if (e) handleMessageCreated(e) },
    'channel:message:updated': (data) => { const e = realtimePayload<{ channelId: number; message: ChannelMessage }>(data); if (e) handleMessageUpdated(e) },
    'channel:message:deleted': (data) => { const e = realtimePayload<{ channelId: number; messageId: number; parentMessageId?: number; newReplyCount?: number }>(data); if (e) handleMessageDeleted(e) },
    'channel:message:pinned': (data) => { const e = realtimePayload<{ channelId: number; messageId: number; isPinned: boolean }>(data); if (e) handleMessagePinned(e) },
    'channel:reaction:changed': (data) => { const e = realtimePayload<{ channelId: number; messageId: number; reactions: Record<string, number[]> }>(data); if (e) handleReactionChanged(e) },
    'channel:thread:reply': (data) => { const e = realtimePayload<{ channelId: number; parentId: number; reply: ChannelMessage; newReplyCount: number }>(data); if (e) handleThreadReply(e) },
    'channel:channel:created': (data) => { const e = realtimePayload<{ channel: ChannelSummary }>(data); if (e) handleChannelCreated(e) },
    'channel:channel:updated': (data) => { const e = realtimePayload<{ channel: ChannelSummary }>(data); if (e) handleChannelUpdated(e) },
    'channel:channel:archived': (data) => { const e = realtimePayload<{ channelId: number }>(data); if (e) handleChannelArchived(e) },
    'channel:typing:start': (data) => { const e = realtimePayload<{ channelId: number; userId: number; userName: string }>(data); if (e) handleTypingStart(e) },
    'notification:created': (data) => { const e = realtimePayload<{ notification: NotificationItem }>(data); if (e) handleNotificationCreated(e) },
    'presence:updated': (data) => { const e = realtimePayload<{ userId: number; status: string; statusEmoji?: string; statusMessage?: string; lastActivityAt: string }>(data); if (e) handlePresenceUpdated(e) },
    'presence:activity': (data) => { const e = realtimePayload<{ userId: number; lastActivityAt: string }>(data); if (e) handlePresenceActivity(e) },
  })

  // Refresh channel feed saat ganti channel (tunggu list channel ter-load).
  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]); setChannelMembers([]); setThreadParent(null); setThreadReplies([])
      setChannelStatus({ loading: false, message: null })
      return
    }
    setThreadParent(null); setThreadReplies([])
    if (!enabled || !channelsLoaded) return
    void refreshChannel(selectedChannelId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedChannelId, channelsLoaded])

  useEffect(() => {
    if (!enabled || !selectedChannelId || !selectedThreadId) return
    void refreshChannel(selectedChannelId, selectedThreadId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedChannelId, selectedThreadId])

  useEffect(() => () => {
    typingTimersRef.current.forEach((t) => clearTimeout(t))
    typingTimersRef.current.clear()
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
  }, [])

  const value: WorkspaceContextValue = {
    currentUser,
    programs,
    kpis,
    dashboard,
    apmsKpis,
    programSummary,
    selectedProgramId,
    overviewStatus,
    loadOverview,
    openProgramWorkspace,
    normalizeHealthStatus,
    formatStatusLabel,
    workGroups,
    workGroupsStatus,
    reloadTasks,
    blockers,
    boardStatus,
    boardOnOpen,
    clearBoardOnOpen,
    taskDetail,
    setTaskDetail,
    selectedTaskId,
    setSelectedTaskId,
    appendComposerSnippet,
    assignmentRefreshTick,
    meetingRefreshKey: 0,
    presence,
    setPresence,
    presenceDraft,
    setPresenceDraft,
    channels,
    setChannels,
    selectedChannelId,
    setSelectedChannelId,
    selectedThreadId,
    setSelectedThreadId,
    selectedChannel,
    channelMembers,
    messages,
    setMessages,
    threadParent,
    threadReplies,
    setThreadReplies,
    channelStatus,
    setChannelStatus,
    refreshChannel,
    totalUnreadChannels,
    typingUsers,
    sendTyping,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
