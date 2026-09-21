import type { ClineMessage, TurnState } from "@shared/ExtensionMessage"

// Convergent-replica reducer for the webview's clineMessages transcript.
//
// The webview receives the same conversation over two unordered, fire-and-forget channels
// (incremental partial messages and full state snapshots). This reducer makes the transcript
// converge to the correct set under ANY arrival order, duplication, or loss, using three
// extension-stamped quantities:
//
//   - ts    : message identity / merge key (one process-wide monotonic id; see MessageIdMinter)
//   - seq   : freshness within an epoch (higher seq = newer copy of the same ts)
//   - epoch : conversation/replica fence (newer epoch replaces; older is dropped)
//
// The reducer is a pure function so it can be exhaustively unit-tested (including
// property-based, order-independent tests) with no React/gRPC/timers.

/**
 * The webview's replica of the conversation transcript plus the fence/freshness high-water
 * marks needed to reject stale traffic. `messages` is kept as an array (rendering order) and
 * mirrors what the UI consumes.
 */
export interface ReplicaState {
	messages: ClineMessage[]
	/** Highest epoch applied. Messages/snapshots from an older epoch are dropped. */
	epoch: number
	/** Highest per-message seq applied per ts. Used to ignore older copies of the same ts. */
	seqByTs: Map<number, number>
	/** Highest state snapshot version applied. Older snapshots are ignored wholesale. */
	stateVersion: number
	/**
	 * Highest `ts` dropped by a cap prune. Once the transcript is capped, any
	 * same-epoch message at or below this ts has already been dropped from the
	 * webview and must not be re-appended by a later full-snapshot merge (which
	 * re-sends the whole transcript).
	 */
	prunedThroughTs?: number
	/**
	 * The authoritative UI mode for the current turn. Moves forward by `turnState.seq` only, so a
	 * late/out-of-order snapshot carrying an older phase (e.g. "idle") can never revert a newer
	 * phase (e.g. "streaming"). `undefined` for classic/legacy state with no turnState.
	 */
	turnState?: TurnState
}

/** Create an empty replica. */
export function createReplicaState(): ReplicaState {
	return { messages: [], epoch: 0, seqByTs: new Map(), stateVersion: 0, turnState: undefined }
}

/**
 * Effective epoch of an incoming item. Unstamped (classic/legacy) items use 0, which equals
 * a fresh replica's epoch, so they merge rather than being dropped.
 */
function epochOf(item: { epoch?: number }): number {
	return item.epoch ?? 0
}

function seqOf(message: ClineMessage): number {
	return message.seq ?? 0
}

/**
 * Upper bound on the number of messages the webview retains for the current
 * task/epoch. The host re-posts the FULL transcript on every state update and
 * every streamed partial appends another entry, so without a bound a long
 * session grows the renderer's message array and seq map without limit and can
 * OOM the webview (blank screen). Keeping the newest messages preserves the
 * live conversation and the streaming tail the UI renders.
 */
const MAX_TRANSCRIPT_MESSAGES = 1000

/** Drop the oldest messages so the transcript stays within MAX_TRANSCRIPT_MESSAGES. */
function pruneToCap(state: ReplicaState): ReplicaState {
	if (state.messages.length <= MAX_TRANSCRIPT_MESSAGES) {
		return state
	}
	const dropped = state.messages.length - MAX_TRANSCRIPT_MESSAGES
	const messages = state.messages.slice(dropped)
	// Track the newest ts we discarded so a later full-snapshot merge cannot
	// re-append already-pruned messages.
	const prunedThroughTs = state.messages[dropped - 1].ts
	// Prune the seq high-water marks in lockstep so the map cannot outgrow the
	// transcript it indexes.
	const seqByTs = new Map<number, number>()
	for (const m of messages) {
		seqByTs.set(m.ts, seqOf(m))
	}
	return { ...state, messages, seqByTs, prunedThroughTs }
}

/** Replace the replica's transcript wholesale at a new epoch (new task / history load). */
function resetTo(epoch: number, messages: ClineMessage[], stateVersion: number, turnState?: TurnState): ReplicaState {
	const seqByTs = new Map<number, number>()
	for (const m of messages) {
		const existing = seqByTs.get(m.ts)
		if (existing === undefined || seqOf(m) >= existing) {
			seqByTs.set(m.ts, seqOf(m))
		}
	}
	return pruneToCap({ messages: [...messages], epoch, seqByTs, stateVersion, turnState })
}

/**
 * Apply a TurnState update, gated by `seq`. The replica keeps the highest-seq TurnState and
 * ignores older ones, so a late/out-of-order "streaming" can never overwrite a newer
 * "completed" (and vice-versa). Returns the same state when ignored.
 */
export function applyTurnState(state: ReplicaState, incoming: TurnState | undefined): ReplicaState {
	if (!incoming) {
		return state
	}
	if (state.turnState !== undefined && incoming.seq <= state.turnState.seq) {
		return state
	}
	return { ...state, turnState: incoming }
}

/**
 * Apply one incoming ClineMessage (from the partial-message stream OR from within a state
 * snapshot). Returns the same state object when the message is stale/ignored, or a new state
 * when it changes the transcript.
 *
 * Rules:
 *  - older epoch  -> drop (straggler from a previous task/render)
 *  - newer epoch  -> advance the fence, but do NOT discard the existing transcript on the
 *                    strength of a single message. The authoritative wholesale replace for a
 *                    new task/render comes from a full state snapshot (applyStateSnapshot); a
 *                    lone newer-epoch *partial* (e.g. a bookkeeping api_req_started that raced
 *                    ahead of its snapshot) must not empty a live conversation — that would
 *                    strand the webview at messages.length === 0 and route Enter to newTask().
 *                    So we bump the epoch and append/merge this one message; the snapshot that
 *                    follows will reconcile to the true new-task transcript.
 *  - same epoch   -> upsert by ts, keeping the higher seq
 */
export function applyMessage(state: ReplicaState, incoming: ClineMessage): ReplicaState {
	const incomingEpoch = epochOf(incoming)

	if (incomingEpoch < state.epoch) {
		return state
	}

	if (incomingEpoch > state.epoch) {
		// Advance the fence without throwing away an existing transcript. Carry the prior
		// messages forward at the new epoch and merge this one in; a subsequent newer-epoch
		// snapshot performs the real wholesale replace when a genuine new task begins.
		const advanced: ReplicaState = {
			messages: [...state.messages],
			epoch: incomingEpoch,
			seqByTs: new Map(state.seqByTs),
			stateVersion: state.stateVersion,
			turnState: state.turnState,
			prunedThroughTs: state.prunedThroughTs,
		}
		return applyMessage(advanced, incoming)
	}

	// A same-epoch message at or below the prune floor was already dropped from the
	// webview (its slot freed). Re-inserting it would re-grow the transcript past the
	// cap on every full-snapshot merge, so treat it as stale.
	if (state.prunedThroughTs !== undefined && incoming.ts <= state.prunedThroughTs) {
		return state
	}

	// Same epoch: merge by ts, keep highest seq.
	const existingSeq = state.seqByTs.get(incoming.ts)
	const index = state.messages.findIndex((m) => m.ts === incoming.ts)

	if (index !== -1) {
		// A copy of this ts already exists. Keep ours unless the incoming is at least as fresh.
		if (existingSeq !== undefined && seqOf(incoming) < existingSeq) {
			return state
		}
		const messages = [...state.messages]
		messages[index] = incoming
		const seqByTs = new Map(state.seqByTs)
		seqByTs.set(incoming.ts, Math.max(existingSeq ?? 0, seqOf(incoming)))
		return { ...state, messages, seqByTs }
	}

	// New ts at the current epoch — append.
	const messages = [...state.messages, incoming]
	const seqByTs = new Map(state.seqByTs)
	seqByTs.set(incoming.ts, seqOf(incoming))
	// Bound the transcript: streaming partials and full-snapshot merges both land
	// here, so this is the single funnel that keeps long sessions from growing the
	// webview's message array without limit.
	return pruneToCap({ ...state, messages, seqByTs })
}

/**
 * Apply a full state snapshot's transcript.
 *
 *  - older epoch        -> drop entirely
 *  - newer epoch        -> replace the transcript wholesale (new task / history load)
 *  - same epoch:
 *      - older/equal stateVersion -> ignore (a newer snapshot already applied)
 *      - newer stateVersion       -> MERGE each message by ts/seq (NEVER truncate). This is the
 *                                    fix for "last message missing": a snapshot that lacks a
 *                                    message the partial stream already delivered cannot drop it.
 *
 * `snapshotEpoch`/`snapshotVersion` default to 0 (unstamped classic/legacy) which merges.
 *
 * `snapshotTurnState` (when present) is applied through the same seq gate as applyTurnState: a
 * newer epoch adopts it wholesale; otherwise it only advances the replica's turnState if its
 * seq is higher. This is what stops a late/stale snapshot from reverting "streaming" -> "idle".
 */
export function applyStateSnapshot(
	state: ReplicaState,
	snapshotMessages: ClineMessage[],
	snapshotEpoch = 0,
	snapshotVersion = 0,
	snapshotTurnState?: TurnState,
): ReplicaState {
	if (snapshotEpoch < state.epoch) {
		return state
	}

	if (snapshotEpoch > state.epoch) {
		if (
			snapshotMessages.length === 0 &&
			state.messages.length > 0 &&
			(state.turnState?.phase === "streaming" || state.turnState?.phase === "awaiting_approval")
		) {
			// Poisoned epoch advance: an EMPTY snapshot at a newer epoch can never be a
			// legitimate replacement for a populated, live transcript — a streaming turn
			// always has at least its task message. The only known producer was
			// showTaskWithId clearing the old proxy's messages + bumping the epoch before
			// its async history loads (fixed host-side); keep this guard so a new producer
			// of the same race can never wipe a live conversation and strand the webview
			// on an invisible-but-running session. Ignore the snapshot; the real
			// replacement snapshot (non-empty, e.g. history open, new task with its task
			// message) applies normally. A deliberate clearTask empties at an idle phase,
			// which never enters this branch.
			return state
		}
		// New task/render: replace transcript AND adopt the snapshot's turnState wholesale.
		return resetTo(snapshotEpoch, snapshotMessages, snapshotVersion, snapshotTurnState)
	}

	// Same epoch.
	if (snapshotVersion !== 0 && snapshotVersion <= state.stateVersion) {
		// A newer (or equal) snapshot already applied for the transcript — but a turnState with a
		// higher seq may still need to move the UI forward, so don't bail before the seq gate.
		return applyTurnState(state, snapshotTurnState)
	}

	// Merge each message; never shrink the transcript for the same task/epoch.
	let next = state
	for (const message of snapshotMessages) {
		next = applyMessage(next, message)
	}
	if (snapshotVersion > next.stateVersion) {
		next = next === state ? { ...state } : next
		next.stateVersion = snapshotVersion
	}
	// Gate turnState by seq so a stale snapshot cannot revert a newer phase.
	next = applyTurnState(next, snapshotTurnState)
	return next
}
